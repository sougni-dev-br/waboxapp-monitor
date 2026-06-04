import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as jose from "jose";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import {
  applyLabelsToContact,
  contactHasLabel,
  createInstance,
  createLabel,
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
  getLabelRules,
  getLabels,
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

// ID fixo do painel (único usuário do sistema)
const OWNER_ID = 1;

export const appRouter = router({
  system: systemRouter,

  // ─── Auth própria ────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => {
      if (opts.ctx.isAuthed) {
        return { id: OWNER_ID, name: "Rafael", role: "admin" };
      }
      return null;
    }),

    login: publicProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const panelPassword = process.env.PANEL_PASSWORD;
        if (!panelPassword) {
          console.error("[Auth] PANEL_PASSWORD não configurado no .env");
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Painel mal configurado. Contate o administrador." });
        }
        if (input.password !== panelPassword) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta." });
        }

        const secret = new TextEncoder().encode(ENV.cookieSecret || "waboxapp-panel-secret");
        const token = await new jose.SignJWT({ sub: "panel-owner", role: "admin" })
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

    // Renova o token silenciosamente — chamado pelo frontend a cada 7 dias
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      const secret = new TextEncoder().encode(ENV.cookieSecret || "waboxapp-panel-secret");
      const token = await new jose.SignJWT({ sub: "panel-owner", role: "admin" })
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
    list: protectedProcedure.query(async () => {
      return getInstances(OWNER_ID);
    }),

    add: protectedProcedure
      .input(z.object({ uid: z.string().min(5), alias: z.string().optional() }))
      .mutation(async ({ input }) => {
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
      .query(async ({ input }) => {
        const allInstances = await getInstances(OWNER_ID);
        const instance = allInstances.find((i) => i.id === input.instanceId);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
        return getStatusLogs(input.instanceId, input.limit ?? 50);
      }),

    /**
     * Configura automaticamente o hook URL de uma instância (ou todas) na WaboxApp
     * para apontar pro nosso webhook. Garante que mensagens in+out sejam salvas.
     */
    setupWebhook: protectedProcedure
      .input(z.object({ id: z.number().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        const config = await getApiConfig(OWNER_ID);
        if (!config?.token) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a chave da API primeiro." });
        }

        // URL pública: usa o host da requisição (Cloudflare/Render)
        const proto = (ctx.req.headers["x-forwarded-proto"] as string) ?? ctx.req.protocol ?? "https";
        const host = (ctx.req.headers["x-forwarded-host"] as string) ?? ctx.req.headers.host;
        if (!host) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível detectar o host." });
        const hookUrl = `${proto}://${host}/api/webhook/waboxapp`;

        const allInstances = await getInstances(OWNER_ID);
        const targets = input?.id ? allInstances.filter((i) => i.id === input.id) : allInstances;
        if (!targets.length) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma instância encontrada." });

        const results = await Promise.all(targets.map(async (inst) => {
          const r = await setHookUrl(config.token, inst.uid, hookUrl);
          if (r.success) {
            await updateInstanceStatus(inst.id, inst.status, { hookUrl });
          }
          return { instanceId: inst.id, alias: inst.alias ?? inst.uid, ok: r.success, error: r.error };
        }));

        return { hookUrl, results };
      }),
  }),

  // ─── Analytics ───────────────────────────────────────────────────────────────
  analytics: router({
    dailyContacts: protectedProcedure
      .input(z.object({ instanceId: z.number(), days: z.number().optional() }))
      .query(async ({ input }) => {
        const allInstances = await getInstances(OWNER_ID);
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
      .input(z.object({ name: z.string().min(1).max(64), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
      .mutation(async ({ input }) => {
        const id = await createLabel({ userId: OWNER_ID, name: input.name, color: input.color });
        return { id };
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
      .query(async ({ input }) => {
        const allInstances = await getInstances(OWNER_ID);
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
      .query(async ({ input }) => {
        const allInstances = await getInstances(OWNER_ID);
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
  }),

  // ─── Dashboard ────────────────────────────────────────────────
  dashboard: router({
    realtime: protectedProcedure
      .query(async () => {
        return getRealtimePulse(OWNER_ID);
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
      .query(async ({ input }) => {
        return getDashboardOverview(OWNER_ID, {
          dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
          hospitals: input?.hospitals,
          procedures: input?.procedures,
        });
      }),

    operation: protectedProcedure
      .input(
        z.object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return getOperationOverview(OWNER_ID, {
          dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
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
      .query(async ({ input }) => {
        const dateFrom = input?.dateFrom ? new Date(input.dateFrom) : undefined;
        const dateTo = input?.dateTo ? new Date(input.dateTo + "T23:59:59.999") : undefined;
        return getMediaInvestmentSummary({
          dateFrom,
          dateTo,
          hospitals: input?.hospitals,
          procedures: input?.procedures,
        });
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
