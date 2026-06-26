import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as jose from "jose";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, adminProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import {
  applyLabelsToContact,
  contactHasLabel,
  createInstance,
  createLabel,
  updateLabel,
  updateLabelRule,
  createLabelRule,
  deleteInstance,
  deleteLabel,
  deleteLabelRule,
  getApiConfig,
  getAllContacts,
  getContactLabels,
  getContacts,
  getContactsWithoutLabel,
  getDailyContactStats,
  getDashboardOverview,
  getOperationOverview,
  getRealtimePulse,
  getFirstInboundMessages,
  getInstanceByUid,
  getInstances,
  getVisibleInstances,
  getUnits,
  getActiveUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  getUnitLinkCounts,
  getLabelRules,
  getLabels,
  getLeadsWithAggregatedText,
  getMessages,
  getStatusLogs,
  insertMessage,
  insertStatusLog,
  matchAllLabelsForMessages,
  upsertApiConfig,
  upsertContact,
  updateInstanceStatus,
} from "./db";
import { checkInstanceStatus, sendTextMessage, setHookUrl } from "./waboxapp";
import { getMediaInvestmentSummary } from "./mediaInvestment";
import { nanoid } from "nanoid";
import { findUserByUsername, verifyPassword, touchLastSignedIn, hashPassword, PERMISSIONS } from "./auth";
import { getInvestmentSummary, getPipelineSummary } from "./sheetsIngest";
import { HOSPITALS, instanceHospital, getHospitalNames } from "./hospitalUtils";

// ID fixo do painel (dono dos dados — instâncias/contatos/mensagens)
const OWNER_ID = 1;

/**
 * Resolve o escopo de visibilidade de unidades de um usuário.
 *
 * - Admins e usuários sem `allowedHospitals` (null/[]) → sem restrição:
 *   `instanceIds = undefined` (as funções de dashboard tratam como "tudo") e
 *   `allowedHospitals = null` (clamp vira no-op).
 * - Usuário restrito → `instanceIds` = IDs visíveis e `allowedHospitals` = lista.
 *
 * Retornar `undefined` em instanceIds é importante: preserva 100% o
 * comportamento atual para admins (sem nenhuma filtragem extra).
 */
async function resolveScope(
  user: { role: string; allowedHospitals?: string[] | null },
): Promise<{ instanceIds?: number[]; allowedHospitals: string[] | null }> {
  const allowed = user.allowedHospitals ?? null;
  if (user.role === "admin" || !allowed || allowed.length === 0) {
    return { instanceIds: undefined, allowedHospitals: null };
  }
  const visible = await getVisibleInstances(OWNER_ID, allowed);
  return { instanceIds: visible.map((i) => i.id), allowedHospitals: allowed };
}

/** Restringe um filtro de hospitais (multi) ao conjunto permitido do usuário. */
function clampHospitals(input: string[] | undefined, allowed: string[] | null): string[] | undefined {
  if (!allowed || allowed.length === 0) return input; // sem restrição
  if (!input || input.length === 0) return allowed;    // usuário não filtrou → limita ao permitido
  return input.filter((h) => allowed.includes(h));
}

/** Restringe um filtro de hospital (single) ao conjunto permitido do usuário. */
function clampHospital(input: string | undefined, allowed: string[] | null): string | undefined {
  if (!allowed || allowed.length === 0) return input;     // sem restrição
  if (input && allowed.includes(input)) return input;     // escolha válida
  return undefined; // escolha inválida/ausente → backend agrega só o permitido via instanceIds; sheets fica amplo mas sem dado cruzado relevante
}

/**
 * Conjunto de nomes de unidades válidos. Fonte: tabela `units`; fallback para
 * `HOSPITALS` enquanto o banco ainda não tem unidades cadastradas.
 */
async function validUnitNames(): Promise<Set<string>> {
  const dbUnits = await getUnits();
  const names = dbUnits.length ? dbUnits.map((u) => u.name) : [...HOSPITALS];
  return new Set(names);
}

/** Valida que todos os nomes pertencem ao conjunto de unidades conhecidas. */
async function assertKnownUnits(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const known = await validUnitNames();
  for (const n of names) {
    if (!known.has(n)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Unidade inválida: ${n}` });
    }
  }
}

export const appRouter = router({
  system: systemRouter,

  // ─── Auth própria ────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.isAuthed || !ctx.user) return null;
      return {
        id: ctx.user.id,
        username: ctx.user.username,
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.role,
        // Unidades visíveis (null = sem restrição). Admin sempre vê tudo.
        allowedHospitals: ctx.user.role === "admin" ? null : (ctx.user.allowedHospitals ?? null),
        // Lista completa de chaves liberadas para esse role — frontend usa
        // pra esconder UI antes mesmo de pedir os dados.
        permissions: Object.fromEntries(
          Object.entries(PERMISSIONS).map(([k, roles]) => [k, roles.includes(ctx.user!.role)])
        ),
      };
    }),

    login: publicProcedure
      .input(z.object({
        username: z.string().trim().min(1, "Usuário obrigatório").max(64),
        password: z.string().min(1, "Senha obrigatória"),
      }))
      .mutation(async ({ input, ctx }) => {
        const username = input.username.toLowerCase();
        const user = await findUserByUsername(username);
        if (!user || !user.active) {
          // Mensagem genérica pra não vazar quais usernames existem
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha incorretos." });
        }
        const ok = await verifyPassword(input.password, user.passwordHash);
        if (!ok) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha incorretos." });
        }

        await touchLastSignedIn(user.id);

        const secret = new TextEncoder().encode(ENV.cookieSecret || "waboxapp-panel-secret");
        const token = await new jose.SignJWT({ sub: String(user.id), role: user.role, username: user.username })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("365d")
          .sign(secret);

        const isSecure = ctx.req.headers["x-forwarded-proto"] === "https" || ctx.req.protocol === "https";
        const cookiePath = process.env.COOKIE_PATH ?? "/";
        ctx.res.cookie("panel_session", token, {
          httpOnly: true,
          secure: isSecure,
          sameSite: isSecure ? "none" : "lax",
          maxAge: 365 * 24 * 60 * 60 * 1000, // 1 ano
          path: cookiePath,
        });

        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }),

    // Renova o token silenciosamente — chamado pelo frontend a cada 7 dias
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      const secret = new TextEncoder().encode(ENV.cookieSecret || "waboxapp-panel-secret");
      const token = await new jose.SignJWT({ sub: String(ctx.user.id), role: ctx.user.role, username: ctx.user.username })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("365d")
        .sign(secret);

      const isSecure = ctx.req.headers["x-forwarded-proto"] === "https" || ctx.req.protocol === "https";
      const cookiePath = process.env.COOKIE_PATH ?? "/";
      ctx.res.cookie("panel_session", token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: isSecure ? "none" : "lax",
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 ano
        path: cookiePath,
      });

      return { success: true };
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookiePath = process.env.COOKIE_PATH ?? "/";
      ctx.res.clearCookie("panel_session", { path: cookiePath });
      return { success: true } as const;
    }),
  }),

  // ─── Admin (admin-only) ─────────────────────────────────────────────────────
  // CRUD de usuários e regras de automação. Tudo passa por adminProcedure,
  // que valida ctx.user.role === 'admin' (server-side, ignora UI).
  admin: router({
    users: router({
      list: adminProcedure.query(async () => {
        const db = await import("./db").then((m) => m.getDb());
        if (!db) return [];
        const { users } = await import("../drizzle/schema");
        const rows = await db.select({
          id: users.id,
          username: users.username,
          name: users.name,
          email: users.email,
          role: users.role,
          active: users.active,
          allowedHospitals: users.allowedHospitals,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        }).from(users).orderBy(users.id);
        return rows;
      }),
      create: adminProcedure
        .input(z.object({
          username: z.string().trim().min(2).max(64).regex(/^[a-z0-9_.-]+$/i, "Use letras, números, _, . ou -"),
          name: z.string().trim().min(1).max(128),
          password: z.string().min(6, "Mínimo 6 caracteres").max(128),
          role: z.enum(["admin", "user"]).default("user"),
          allowedHospitals: z.array(z.string().trim().max(64)).nullable().optional(),
        }))
        .mutation(async ({ input }) => {
          if (input.allowedHospitals?.length) await assertKnownUnits(input.allowedHospitals);
          const db = await import("./db").then((m) => m.getDb());
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const username = input.username.toLowerCase();
          const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
          if (existing[0]) {
            throw new TRPCError({ code: "CONFLICT", message: `Username '${username}' já existe.` });
          }
          const passwordHash = await hashPassword(input.password);
          // [] = sem restrição (equivale a null). Admin ignora o campo.
          const allowed = input.allowedHospitals?.length ? input.allowedHospitals : null;
          const inserted = await db.insert(users).values({
            openId: `user-${username}-${Date.now()}`,
            username,
            passwordHash,
            name: input.name,
            role: input.role,
            active: true,
            allowedHospitals: allowed,
            loginMethod: "password",
          }).returning({ id: users.id });
          return { id: inserted[0]?.id, username, role: input.role };
        }),
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().trim().min(1).max(128).optional(),
          role: z.enum(["admin", "user"]).optional(),
          active: z.boolean().optional(),
          allowedHospitals: z.array(z.string().trim().max(64)).nullable().optional(),
          password: z.string().min(6).max(128).optional(),
        }))
        .mutation(async ({ input }) => {
          if (input.allowedHospitals?.length) await assertKnownUnits(input.allowedHospitals);
          const db = await import("./db").then((m) => m.getDb());
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");

          const patch: Record<string, unknown> = {};
          if (input.name !== undefined) patch.name = input.name;
          if (input.role !== undefined) patch.role = input.role;
          if (input.active !== undefined) patch.active = input.active;
          if (input.allowedHospitals !== undefined) {
            patch.allowedHospitals = input.allowedHospitals?.length ? input.allowedHospitals : null;
          }
          if (input.password !== undefined) patch.passwordHash = await hashPassword(input.password);
          if (Object.keys(patch).length === 0) return { success: true };

          await db.update(users).set(patch).where(eq(users.id, input.id));
          return { success: true };
        }),
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          if (ctx.user.id === input.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode se autodeletar." });
          }
          const db = await import("./db").then((m) => m.getDb());
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          // Soft delete: marca inativo (preserva foreign keys)
          await db.update(users).set({ active: false }).where(eq(users.id, input.id));
          return { success: true };
        }),
    }),

    automation: router({
      list: adminProcedure.query(async () => {
        const db = await import("./db").then((m) => m.getDb());
        if (!db) return [];
        const { automationRules } = await import("../drizzle/schema");
        const { desc } = await import("drizzle-orm");
        return db.select().from(automationRules).orderBy(desc(automationRules.updatedAt));
      }),
      upsert: adminProcedure
        .input(z.object({
          id: z.number().optional(),
          name: z.string().trim().min(1).max(128),
          trigger: z.enum([
            "lead_in",                // novo lead chegou
            "lead_no_reply_5min",     // sem resposta há 5 min comerciais
            "lead_no_reply_30min",    // sem resposta há 30 min comerciais
            "lead_read_no_reply",     // operador leu mas não respondeu
            "lead_keyword_match",     // mensagem do lead bate com keywords
          ]),
          hospital: z.string().trim().max(64).optional().nullable(),
          keywords: z.string().trim().max(2048).optional().nullable(),
          delayMinutes: z.number().int().min(0).max(60 * 24).default(0),
          message: z.string().trim().min(1).max(4096),
          active: z.boolean().default(true),
        }))
        .mutation(async ({ input, ctx }) => {
          const db = await import("./db").then((m) => m.getDb());
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
          const { automationRules } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const payload = {
            userId: ctx.user.id,
            name: input.name,
            trigger: input.trigger,
            hospital: input.hospital ?? null,
            keywords: input.keywords ?? null,
            delayMinutes: input.delayMinutes,
            message: input.message,
            active: input.active,
          };
          if (input.id) {
            await db.update(automationRules).set(payload).where(eq(automationRules.id, input.id));
            return { id: input.id };
          }
          const inserted = await db.insert(automationRules).values(payload).returning({ id: automationRules.id });
          return { id: inserted[0]?.id };
        }),
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const db = await import("./db").then((m) => m.getDb());
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
          const { automationRules } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await db.delete(automationRules).where(eq(automationRules.id, input.id));
          return { success: true };
        }),
    }),
  }),

  // ─── Units (unidades/hospitais) ──────────────────────────────────────────────
  // Fonte de verdade das unidades. Leitura para qualquer autenticado (user só
  // enxerga as ativas); escrita só para admin.
  units: router({
    /** Admin vê todas (ativas + inativas); user vê só as ativas. */
    list: protectedProcedure.query(async ({ ctx }) => {
      const all = await getUnits();
      if (ctx.user.role === "admin") return all;
      return all.filter((u) => u.active);
    }),

    /** Só unidades ativas — usado pelos selects de cadastro e pelo filtro. */
    listActive: protectedProcedure.query(async () => {
      return getActiveUnits();
    }),

    /** Contagem de instâncias vinculadas por unidade (para a UI de gestão). */
    linkCounts: adminProcedure.query(async () => {
      return getUnitLinkCounts();
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(128),
      }))
      .mutation(async ({ input }) => {
        const name = input.name.toUpperCase().trim();
        const existing = await getUnits();
        if (existing.some((u) => u.name === name)) {
          throw new TRPCError({ code: "CONFLICT", message: `Unidade '${name}' já existe.` });
        }
        const id = await createUnit(name, input.label.trim());
        return { id, name };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().trim().min(1).max(64).optional(),
        label: z.string().trim().min(1).max(128).optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const patch: { name?: string; label?: string; active?: boolean } = {};
        if (input.name !== undefined) {
          const name = input.name.toUpperCase().trim();
          // Garante unicidade de name ao renomear
          const existing = await getUnits();
          if (existing.some((u) => u.name === name && u.id !== input.id)) {
            throw new TRPCError({ code: "CONFLICT", message: `Unidade '${name}' já existe.` });
          }
          patch.name = name;
        }
        if (input.label !== undefined) patch.label = input.label.trim();
        if (input.active !== undefined) patch.active = input.active;
        await updateUnit(input.id, patch);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const res = await deleteUnit(input.id);
        if (!res.ok) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: res.reason ?? "Não foi possível remover a unidade." });
        }
        return { success: true };
      }),
  }),

  // ─── Config ─────────────────────────────────────────────────────────────────
  config: router({
    get: protectedProcedure.query(async () => {
      const config = await getApiConfig(OWNER_ID);
      return config ? { hasToken: true, token: config.token } : { hasToken: false, token: null };
    }),

    save: protectedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await upsertApiConfig(OWNER_ID, input.token);
        return { success: true };
      }),
  }),

  // ─── Instances ───────────────────────────────────────────────────────────────
  instances: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getVisibleInstances(OWNER_ID, ctx.user.allowedHospitals);
    }),

    add: protectedProcedure
      .input(z.object({ uid: z.string().min(5), alias: z.string().optional(), hospital: z.string().trim().max(64).optional() }))
      .mutation(async ({ input }) => {
        if (input.hospital) await assertKnownUnits([input.hospital]);
        const config = await getApiConfig(OWNER_ID);
        if (!config?.token) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Configure a chave da API primeiro em Configurações.",
          });
        }

        const existing = await getInstanceByUid(OWNER_ID, input.uid);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Esta instância já está cadastrada." });
        }

        const statusResult = await checkInstanceStatus(config.token, input.uid);

        const id = await createInstance({
          userId: OWNER_ID,
          uid: input.uid,
          alias: input.alias ?? statusResult.alias ?? input.uid,
          hospital: input.hospital ?? null,
          status: statusResult.success ? "online" : "offline",
          platform: statusResult.platform ?? null,
          battery: statusResult.battery ? parseInt(statusResult.battery, 10) : null,
          plugged: statusResult.plugged === "1",
          locale: statusResult.locale ?? null,
          hookUrl: statusResult.hook_url ?? null,
          lastCheckedAt: new Date(),
          lastOnlineAt: statusResult.success ? new Date() : null,
        });

        await insertStatusLog({
          instanceId: id,
          status: statusResult.success ? "online" : "offline",
          battery: statusResult.battery ? parseInt(statusResult.battery, 10) : null,
          plugged: statusResult.plugged === "1",
        });

        return { id, status: statusResult.success ? "online" : "offline" };
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const allInstances = await getInstances(OWNER_ID);
        const instance = allInstances.find((i) => i.id === input.id);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada." });
        await deleteInstance(input.id);
        return { success: true };
      }),

    /** Renomeia o canal (alias visível na sidebar e nos relatórios). */
    updateAlias: protectedProcedure
      .input(z.object({ id: z.number(), alias: z.string().trim().min(1).max(128) }))
      .mutation(async ({ input }) => {
        const allInstances = await getInstances(OWNER_ID);
        const instance = allInstances.find((i) => i.id === input.id);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Canal não encontrado." });

        const db = await import("./db").then((m) => m.getDb());
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { instances } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(instances).set({ alias: input.alias }).where(eq(instances.id, input.id));
        return { success: true, alias: input.alias };
      }),

    /**
     * Atualiza alias e/ou unidade (hospital) de um canal existente.
     * Permite backfill manual da coluna `hospital` nos canais já cadastrados.
     */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        alias: z.string().trim().min(1).max(128).optional(),
        hospital: z.string().trim().max(64).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.hospital) await assertKnownUnits([input.hospital]);
        const allInstances = await getInstances(OWNER_ID);
        const instance = allInstances.find((i) => i.id === input.id);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Canal não encontrado." });

        const db = await import("./db").then((m) => m.getDb());
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const { instances } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        const patch: { alias?: string; hospital?: string | null } = {};
        if (input.alias !== undefined) patch.alias = input.alias;
        if (input.hospital !== undefined) patch.hospital = input.hospital;
        if (Object.keys(patch).length === 0) return { success: true };

        await db.update(instances).set(patch).where(eq(instances.id, input.id));
        return { success: true };
      }),

    checkStatus: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const config = await getApiConfig(OWNER_ID);
        if (!config?.token) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Token não configurado." });

        const allInstances = await getInstances(OWNER_ID);
        const instance = allInstances.find((i) => i.id === input.id);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada." });

        const result = await checkInstanceStatus(config.token, instance.uid);
        const newStatus = result.success ? "online" : "offline";

        await updateInstanceStatus(instance.id, newStatus, {
          alias: result.alias ?? instance.alias,
          platform: result.platform ?? instance.platform,
          battery: result.battery ? parseInt(result.battery, 10) : instance.battery,
          plugged: result.plugged !== undefined ? result.plugged === "1" : instance.plugged,
          locale: result.locale ?? instance.locale,
          hookUrl: result.hook_url ?? instance.hookUrl,
        });

        await insertStatusLog({
          instanceId: instance.id,
          status: newStatus,
          battery: result.battery ? parseInt(result.battery, 10) : null,
          plugged: result.plugged === "1",
        });

        return { status: newStatus, alias: result.alias, platform: result.platform, battery: result.battery, plugged: result.plugged, locale: result.locale };
      }),

    statusLogs: protectedProcedure
      .input(z.object({ instanceId: z.number(), limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const allInstances = await getVisibleInstances(OWNER_ID, ctx.user.allowedHospitals);
        const instance = allInstances.find((i) => i.id === input.instanceId);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
        return getStatusLogs(input.instanceId, input.limit ?? 50);
      }),

    /**
     * Configura automaticamente o hook URL via API WaboxApp.
     * Algumas contas WaboxApp não permitem isso via API (só pelo painel admin) —
     * nesse caso, o usuário deve copiar a URL e colar no painel manualmente.
     */
    setupWebhook: protectedProcedure
      .input(z.object({ id: z.number().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        const config = await getApiConfig(OWNER_ID);
        if (!config?.token) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a chave da API primeiro." });
        }

        const proto = (ctx.req.headers["x-forwarded-proto"] as string) ?? ctx.req.protocol ?? "https";
        const host = (ctx.req.headers["x-forwarded-host"] as string) ?? ctx.req.headers.host;
        if (!host) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível detectar o host." });
        const hookUrl = `${proto}://${host}/api/webhook/waboxapp`;

        const allInstances = await getInstances(OWNER_ID);
        const targets = input?.id ? allInstances.filter((i) => i.id === input.id) : allInstances;
        if (!targets.length) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma instância encontrada." });

        const results = await Promise.all(targets.map(async (inst) => {
          const r = await setHookUrl(config.token, inst.uid, hookUrl);
          if (r.success) await updateInstanceStatus(inst.id, inst.status, { hookUrl });
          return { instanceId: inst.id, alias: inst.alias ?? inst.uid, ok: r.success, error: r.error };
        }));

        return { hookUrl, results };
      }),

    /**
     * Retorna o status do webhook por instância — URL esperada vs URL atualmente
     * configurada na WaboxApp (puxa via /status, que retorna hook_url).
     */
    webhookStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const config = await getApiConfig(OWNER_ID);
        const proto = (ctx.req.headers["x-forwarded-proto"] as string) ?? ctx.req.protocol ?? "https";
        const host = (ctx.req.headers["x-forwarded-host"] as string) ?? ctx.req.headers.host ?? "monitor.sougni.com";
        const expectedHookUrl = `${proto}://${host}/api/webhook/waboxapp`;

        const allInstances = await getVisibleInstances(OWNER_ID, ctx.user.allowedHospitals);

        // Pra cada instância online com token, busca o hook_url atual no WaboxApp
        const instances = await Promise.all(allInstances.map(async (inst) => {
          let currentHookUrl: string | null = inst.hookUrl ?? null;
          let canCheck = false;
          if (config?.token) {
            try {
              const status = await checkInstanceStatus(config.token, inst.uid);
              if (status.success && status.hook_url !== undefined) {
                currentHookUrl = status.hook_url ?? null;
                canCheck = true;
                if (currentHookUrl !== inst.hookUrl) {
                  await updateInstanceStatus(inst.id, inst.status, { hookUrl: currentHookUrl });
                }
              }
            } catch {
              // ignora
            }
          }
          const isOk = currentHookUrl === expectedHookUrl;
          return {
            instanceId: inst.id,
            alias: inst.alias ?? inst.uid,
            uid: inst.uid,
            status: inst.status,
            currentHookUrl,
            isOk,
            canCheck,
          };
        }));

        return { expectedHookUrl, instances };
      }),
  }),

  // ─── Analytics ───────────────────────────────────────────────────────────────
  analytics: router({
    dailyContacts: protectedProcedure
      .input(z.object({ instanceId: z.number(), days: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const allInstances = await getVisibleInstances(OWNER_ID, ctx.user.allowedHospitals);
        const instance = allInstances.find((i) => i.id === input.instanceId);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
        return getDailyContactStats(input.instanceId, input.days ?? 30);
      }),
  }),

  // ─── Labels ──────────────────────────────────────────────────────────────────
  labels: router({
    list: protectedProcedure.query(async () => {
      return getLabels(OWNER_ID);
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(64), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
      .mutation(async ({ input }) => {
        const id = await createLabel({ userId: OWNER_ID, name: input.name, color: input.color });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().trim().min(1).max(64).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      }))
      .mutation(async ({ input }) => {
        await updateLabel(input.id, OWNER_ID, { name: input.name, color: input.color });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLabel(input.id, OWNER_ID);
        return { success: true };
      }),
  }),

  // ─── Label Rules ─────────────────────────────────────────────────────────────
  labelRules: router({
    list: protectedProcedure.query(async () => {
      return getLabelRules(OWNER_ID);
    }),

    create: protectedProcedure
      .input(
        z.object({
          labelId: z.number(),
          keyword: z.string().min(1).max(256),
          matchType: z.enum(["contains", "starts_with", "exact"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = await createLabelRule({
          userId: OWNER_ID,
          labelId: input.labelId,
          keyword: input.keyword,
          matchType: input.matchType ?? "contains",
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        labelId: z.number().optional(),
        keyword: z.string().trim().min(1).max(256).optional(),
        matchType: z.enum(["contains", "starts_with", "exact"]).optional(),
      }))
      .mutation(async ({ input }) => {
        await updateLabelRule(input.id, OWNER_ID, {
          labelId: input.labelId,
          keyword: input.keyword,
          matchType: input.matchType,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLabelRule(input.id, OWNER_ID);
        return { success: true };
      }),

    reapply: protectedProcedure
      .input(
        z.object({
          // Limitar por data de criação do contato (opcional)
          daysBack: z.number().min(1).max(365).optional().default(90),
        })
      )
      .mutation(async ({ input }) => {
        const db = await import("./db").then((m) => m.getDb());
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const { contacts: contactsTable } = await import("../drizzle/schema");
        const { and, eq, isNull, gte } = await import("drizzle-orm");

        const userInstances = await getInstances(OWNER_ID);
        if (!userInstances.length) return { processed: 0, labeled: 0 };
        const instanceIds = userInstances.map((i) => i.id);

        // Buscar contatos SEM NENHUM label na tabela contact_labels
        const since = new Date();
        since.setDate(since.getDate() - (input.daysBack ?? 90));

        const unlabeledContacts = await getContactsWithoutLabel(instanceIds, since);

        let labeled = 0;
        const processed = unlabeledContacts.length;

        for (const contact of unlabeledContacts) {
          const firstMessages = await getFirstInboundMessages(contact.id, 4);
          if (!firstMessages.length) continue;

          const messageTexts = firstMessages.map((msg) => {
            const body = msg.body as { text?: string } | null;
            return typeof body?.text === "string" ? body.text : "";
          });

          // Aplica TODOS os labels que fazem match
          const labelIds = await matchAllLabelsForMessages(OWNER_ID, messageTexts);
          if (labelIds.length > 0) {
            await applyLabelsToContact(contact.id, labelIds);
            labeled++;
          }
        }

        console.log(`[LabelRules] Reapply: processed=${processed}, labeled=${labeled}`);
        return { processed, labeled };
      }),
  }),

  // ─── Contacts ───────────────────────────────────────────────────────────────────────────────
  contacts: router({
    list: protectedProcedure
      .input(
        z.object({
          instanceId: z.number(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          labelId: z.number().nullable().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const allInstances = await getVisibleInstances(OWNER_ID, ctx.user.allowedHospitals);
        const instance = allInstances.find((i) => i.id === input.instanceId);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
        const rows = await getContacts(input.instanceId, {
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          labelId: input.labelId ?? undefined,
        });
        // Enriquecer com array de labels
        const enriched = await Promise.all(
          rows.map(async (c) => ({
            ...c,
            labels: await getContactLabels(c.id),
          }))
        );
        return enriched;
      }),

    listAll: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          labelId: z.number().nullable().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const allInstances = await getVisibleInstances(OWNER_ID, ctx.user.allowedHospitals);
        const instanceIds = allInstances.map((i) => i.id);
        const rows = await getAllContacts(instanceIds, {
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          labelId: input.labelId ?? undefined,
        });
        // Enriquecer com array de labels
        const enriched = await Promise.all(
          rows.map(async (c) => ({
            ...c,
            labels: await getContactLabels(c.id),
          }))
        );
        return enriched;
      }),

    /**
     * Substitui o conjunto de marcadores de um contato (multi-select).
     * Aceita 0..N labelIds; valida que o contato pertence ao usuário.
     */
    setLabels: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        labelIds: z.array(z.number()).max(64),
      }))
      .mutation(async ({ input }) => {
        const db = await import("./db").then((m) => m.getDb());
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

        const { contacts: contactsTable } = await import("../drizzle/schema");
        const { eq, inArray } = await import("drizzle-orm");

        // Garante ownership: contato pertence a uma instância do usuário
        const userInstances = await getInstances(OWNER_ID);
        const ownedInstanceIds = userInstances.map((i) => i.id);
        if (ownedInstanceIds.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contato não encontrado." });
        }
        const [row] = await db
          .select({ id: contactsTable.id, instanceId: contactsTable.instanceId })
          .from(contactsTable)
          .where(eq(contactsTable.id, input.contactId));
        if (!row || !ownedInstanceIds.includes(row.instanceId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contato não encontrado." });
        }

        // Valida que todos labelIds são do usuário
        if (input.labelIds.length > 0) {
          const ownedLabels = await getLabels(OWNER_ID);
          const ownedLabelIds = new Set(ownedLabels.map((l) => l.id));
          for (const lid of input.labelIds) {
            if (!ownedLabelIds.has(lid)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Marcador inválido." });
            }
          }
        }

        const { setContactLabels } = await import("./db");
        await setContactLabels(input.contactId, input.labelIds);
        return { success: true, count: input.labelIds.length };
      }),
  }),

  // ─── Dashboard ────────────────────────────────────────────────
  dashboard: router({
    realtime: protectedProcedure
      .query(async ({ ctx }) => {
        const scope = await resolveScope(ctx.user);
        return getRealtimePulse(OWNER_ID, scope.instanceIds);
      }),

    overview: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          hospitals: z.array(z.string()).optional(),
          procedures: z.array(z.string()).optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const scope = await resolveScope(ctx.user);
        return getDashboardOverview(OWNER_ID, {
          dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
          hospitals: clampHospitals(input?.hospitals, scope.allowedHospitals),
          procedures: input?.procedures,
          visibleInstanceIds: scope.instanceIds,
        });
      }),

    operation: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const scope = await resolveScope(ctx.user);
        return getOperationOverview(OWNER_ID, {
          dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
          visibleInstanceIds: scope.instanceIds,
        });
      }),

    mediaInvestment: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          hospitals: z.array(z.string()).optional(),
          procedures: z.array(z.string()).optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const scope = await resolveScope(ctx.user);
        const dateFrom = input?.dateFrom ? new Date(input.dateFrom) : undefined;
        const dateTo = input?.dateTo ? new Date(input.dateTo + "T23:59:59.999") : undefined;
        return getMediaInvestmentSummary({
          dateFrom,
          dateTo,
          hospitals: clampHospitals(input?.hospitals, scope.allowedHospitals),
          procedures: input?.procedures,
        });
      }),

    /**
     * Resumo de investimento puxado direto da aba CUSTOS da planilha publicada
     * (env SHEETS_CUSTOS_CSV_URL). Cacheado por 60s no backend.
     */
    investment: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          hospital: z.string().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const scope = await resolveScope(ctx.user);
        return getInvestmentSummary({
          dateFrom: input?.dateFrom,
          dateTo: input?.dateTo,
          hospital: clampHospital(input?.hospital, scope.allowedHospitals),
          allowedHospitals: scope.allowedHospitals,
        });
      }),

    /**
     * Resumo de funil/vendas da aba PIPELINE. Devolve agregações por SDR,
     * hospital, canal, procedimento + conversões + receita + tempos.
     */
    pipeline: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          hospital: z.string().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const scope = await resolveScope(ctx.user);
        return getPipelineSummary({
          dateFrom: input?.dateFrom,
          dateTo: input?.dateTo,
          hospital: clampHospital(input?.hospital, scope.allowedHospitals),
          allowedHospitals: scope.allowedHospitals,
        });
      }),

    /**
     * Processa TODOS os leads do monitor (contatos do waboxapp) e devolve
     * pronto pra colar na aba PIPELINE da planilha:
     *   { dateEntered, phone, name, hospital, procedure }
     * - Hospital: alias contém HOPE → HOPE, CBV → CBV, resto → H.Olhos
     * - Procedimento: concatena TODO o texto das mensagens, se bate regex
     *   refrativa/lasik/prk/miopia/astigmatismo/presbiopia/hipermetropia → Refrativa
     *   senão default Catarata
     * - Inclui todos (groups e users) — você filtra depois na planilha
     */
    exportLeadsForPipeline: protectedProcedure.query(async ({ ctx }) => {
      const allInstances = await getVisibleInstances(OWNER_ID, ctx.user.allowedHospitals);
      const instanceIds = allInstances.map((i) => i.id);

      // Nomes das unidades ativas (fonte de verdade no banco; fallback HOSPITALS)
      const db = await import("./db").then((m) => m.getDb());
      const hospitalNames = await getHospitalNames(db);

      const leads = await getLeadsWithAggregatedText(instanceIds);

      const REFRATIVA_REGEX =
        /\b(refrativa|lasik|prk|miopia|m[ií]ope|astigmatismo|presbiopia|hipermetropia|grau\s+(no|nos)\s+olho)\b/i;

      const out = leads.map((lead) => {
        // Deriva o hospital pela fonte única (instances.hospital quando houver,
        // senão fallback do alias). Mantém o mesmo conjunto canônico do resto do app.
        const hospital = instanceHospital({ hospital: lead.instanceHospital, alias: lead.instanceAlias });

        const procedure = REFRATIVA_REGEX.test(lead.allText) ? "Refrativa" : "Catarata";

        // Telefone: limpa @c.us e @g.us pra deixar só dígitos
        const phone = lead.uid.replace(/@(c|g)\.us$/, "").replace(/[^0-9]/g, "");

        // Data: YYYY-MM-DD do firstMessageAt (= createdAt)
        const d = lead.createdAt;
        const dateEntered = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        return {
          dateEntered,
          phone,
          name: lead.name ?? "",
          hospital,
          procedure,
          // Metadados pra debug / revisão
          _type: lead.type,
          _instanceAlias: lead.instanceAlias,
          _messageCount: lead.messageCount,
        };
      });

      return {
        total: out.length,
        countByHospital: Object.fromEntries(
          hospitalNames.map((h) => [h, out.filter((l) => l.hospital === h).length])
        ),
        countByProcedure: {
          Catarata: out.filter((l) => l.procedure === "Catarata").length,
          Refrativa: out.filter((l) => l.procedure === "Refrativa").length,
        },
        countByType: {
          user: out.filter((l) => l._type === "user").length,
          group: out.filter((l) => l._type === "group").length,
        },
        leads: out,
      };
    }),
  }),

  // ─── Messages ──────────────────────────────────────────────────────────────
  messages: router({
    list: protectedProcedure
      .input(z.object({ contactId: z.number(), limit: z.number().optional(), offset: z.number().optional() }))
      .query(async ({ input }) => {
        return getMessages(input.contactId, input.limit ?? 100, input.offset ?? 0);
      }),

    send: protectedProcedure
      .input(
        z.object({
          instanceId: z.number(),
          contactId: z.number(),
          contactUid: z.string().min(1),
          text: z.string().min(1).max(4096),
        })
      )
      .mutation(async ({ input }) => {
        const config = await getApiConfig(OWNER_ID);
        if (!config?.token) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a chave da API primeiro em Configurações." });
        }

        const allInstances = await getInstances(OWNER_ID);
        const instance = allInstances.find((i) => i.id === input.instanceId);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada." });

        if (instance.status !== "online") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Instância offline. Não é possível enviar mensagens." });
        }

        const customUid = `panel-${nanoid(12)}`;
        const result = await sendTextMessage(config.token, instance.uid, input.contactUid, input.text, customUid);

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Falha ao enviar mensagem." });
        }

        const msgId = await insertMessage({
          instanceId: input.instanceId,
          contactId: input.contactId,
          muid: null,
          cuid: customUid,
          direction: "out",
          type: "chat",
          body: { text: input.text },
          ack: 1,
          dtm: Math.floor(Date.now() / 1000),
        });

        return { success: true, messageId: msgId, customUid };
      }),
  }),
});

export type AppRouter = typeof appRouter;
