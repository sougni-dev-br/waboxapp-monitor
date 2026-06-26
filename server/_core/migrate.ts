/**
 * Migrações leves aplicadas no boot — idempotentes via IF NOT EXISTS.
 *
 * Esse arquivo evita a necessidade de rodar `drizzle-kit migrate` em produção
 * quando o servidor sobe pela primeira vez. Cada ALTER aqui precisa ser
 * idempotente (IF NOT EXISTS) pra ser seguro rodar em todo boot.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { hashPassword } from "../auth";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/** Plain-passwords dos usuários iniciais (override via env em produção). */
const SEED_USERS = [
  { username: "rafael", openId: "panel-owner",  name: "Rafael", role: "admin" as const, defaultPassword: "Senha@123" },
  { username: "caio",   openId: "caio-admin",   name: "Caio",   role: "admin" as const, defaultPassword: "Senha@123" },
];

export async function ensureAuthSchema(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[migrate] DB indisponível, pulando ensureAuthSchema");
    return;
  }

  try {
    // 1. Adicionar colunas users (idempotente)
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(64)`);
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" varchar(128)`);
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL`);
    // Controle de acesso por unidade (null = sem restrição, vê tudo)
    await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "allowedHospitals" jsonb`);

    // 1b. Coluna hospital nas instâncias (null = deriva do alias via fallback)
    await db.execute(sql`ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "hospital" varchar(64)`);

    // 2. Índice único de username (case-insensitive via LOWER)
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" ("username")`);

    // 3. Tabela automation_rules
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "automation_rules" (
        "id" serial PRIMARY KEY,
        "userId" integer NOT NULL,
        "name" varchar(128) NOT NULL,
        "trigger" varchar(64) NOT NULL,
        "hospital" varchar(64),
        "keywords" text,
        "delayMinutes" integer DEFAULT 0 NOT NULL,
        "message" text NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "automation_rules_userId_idx" ON "automation_rules" ("userId")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "automation_rules_trigger_idx" ON "automation_rules" ("trigger")`);

    console.log("[migrate] Schema de auth + automation verificado");
  } catch (err) {
    console.error("[migrate] Falha ao aplicar ensureAuthSchema:", err);
    throw err;
  }

  // 3. Seed dos usuários iniciais (idempotente — só atualiza se não tiver passwordHash)
  for (const seed of SEED_USERS) {
    const password = process.env[`SEED_${seed.username.toUpperCase()}_PASSWORD`] ?? seed.defaultPassword;
    const hash = await hashPassword(password);
    try {
      // Tenta achar por username primeiro, senão por openId, senão insere novo
      const byUsername = await db.select().from(users).where(eq(users.username, seed.username)).limit(1);
      if (byUsername[0]) {
        // Só atualiza role/name e — se nunca teve hash — define o seed inicial.
        await db.update(users)
          .set({
            name: seed.name,
            role: seed.role,
            active: true,
            ...(byUsername[0].passwordHash ? {} : { passwordHash: hash }),
          })
          .where(eq(users.id, byUsername[0].id));
        console.log(`[seed] Usuário '${seed.username}' atualizado (id=${byUsername[0].id})`);
        continue;
      }

      const byOpenId = await db.select().from(users).where(eq(users.openId, seed.openId)).limit(1);
      if (byOpenId[0]) {
        await db.update(users)
          .set({
            username: seed.username,
            name: seed.name,
            role: seed.role,
            active: true,
            ...(byOpenId[0].passwordHash ? {} : { passwordHash: hash }),
          })
          .where(eq(users.id, byOpenId[0].id));
        console.log(`[seed] Usuário existente com openId '${seed.openId}' atualizado pra username '${seed.username}'`);
        continue;
      }

      // Novo insert
      const inserted = await db.insert(users).values({
        openId: seed.openId,
        username: seed.username,
        passwordHash: hash,
        name: seed.name,
        role: seed.role,
        active: true,
        loginMethod: "password",
      }).returning({ id: users.id });
      console.log(`[seed] Usuário '${seed.username}' criado (id=${inserted[0]?.id})`);
    } catch (err) {
      console.error(`[seed] Falha ao processar usuário '${seed.username}':`, err);
    }
  }
}
