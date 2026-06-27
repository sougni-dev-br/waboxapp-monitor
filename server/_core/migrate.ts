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

  // Cada passo roda de forma INDEPENDENTE e idempotente. Antes, um único
  // statement com falha (ex.: índice único com duplicatas) abortava todo o
  // resto via try/catch + rethrow — deixando, p.ex., a tabela `units` sem ser
  // criada. Agora cada passo loga seu erro e os demais continuam.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const step = async (label: string, query: any) => {
    const t0 = Date.now();
    try {
      await db.execute(query);
    } catch (err) {
      console.error(`[migrate] passo '${label}' falhou:`, err);
    }
    // Instrumentação: revela qual passo é lento (CREATE em tabela vazia ~ms).
    const ms = Date.now() - t0;
    if (ms > 500) console.warn(`[migrate] passo '${label}' levou ${ms}ms`);
  };

  /**
   * Adiciona uma coluna SÓ se ela ainda não existir.
   *
   * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` adquire ACCESS EXCLUSIVE LOCK na
   * tabela em TODO boot, mesmo quando a coluna já existe — e fica esperando atrás
   * de escritas concorrentes (poller/webhook em `instances`), o que causou 163s
   * de bloqueio. Consultar o information_schema antes é um catalog read barato,
   * sem lock na tabela, e pula o ALTER completamente quando a coluna já existe.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addColumn = async (label: string, table: string, column: string, ddl: any) => {
    try {
      const res = await db.execute(sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = ${column}
        LIMIT 1
      `);
      const rows = (res as unknown as { rows: unknown[] }).rows ?? [];
      if (rows.length > 0) return; // já existe → não toca na tabela (sem lock)
    } catch (err) {
      console.error(`[migrate] checagem de coluna '${label}' falhou, tentando ALTER:`, err);
    }
    await step(label, ddl);
  };

  // 1. Colunas users (só adiciona se ausente — sem lock quando já existe)
  await addColumn("users.username", "users", "username", sql`ALTER TABLE "users" ADD COLUMN "username" varchar(64)`);
  await addColumn("users.passwordHash", "users", "passwordHash", sql`ALTER TABLE "users" ADD COLUMN "passwordHash" varchar(128)`);
  await addColumn("users.active", "users", "active", sql`ALTER TABLE "users" ADD COLUMN "active" boolean DEFAULT true NOT NULL`);
  // Controle de acesso por unidade (null = sem restrição, vê tudo)
  await addColumn("users.allowedHospitals", "users", "allowedHospitals", sql`ALTER TABLE "users" ADD COLUMN "allowedHospitals" jsonb`);

  // 1b. Coluna hospital nas instâncias (null = deriva do alias via fallback)
  await addColumn("instances.hospital", "instances", "hospital", sql`ALTER TABLE "instances" ADD COLUMN "hospital" varchar(64)`);

  // 2. Índice único de username
  await step("users_username_unique", sql`CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" ("username")`);

  // 3. Tabela automation_rules
  await step("automation_rules", sql`
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
  await step("automation_rules_userId_idx", sql`CREATE INDEX IF NOT EXISTS "automation_rules_userId_idx" ON "automation_rules" ("userId")`);
  await step("automation_rules_trigger_idx", sql`CREATE INDEX IF NOT EXISTS "automation_rules_trigger_idx" ON "automation_rules" ("trigger")`);

  // 4. Tabela units (unidades/hospitais) + seed idempotente das 5 unidades atuais
  await step("units.table", sql`
    CREATE TABLE IF NOT EXISTS "units" (
      "id" serial PRIMARY KEY,
      "name" varchar(64) NOT NULL,
      "label" varchar(128) NOT NULL,
      "active" boolean DEFAULT true NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `);
  await step("units_name_unique", sql`CREATE UNIQUE INDEX IF NOT EXISTS "units_name_unique" ON "units" ("name")`);
  await step("units.seed", sql`
    INSERT INTO "units" ("name", "label") VALUES
      ('HOLHOS', 'H.Olhos'),
      ('HOPE', 'Hope'),
      ('CBV', 'CBV'),
      ('CRV', 'CRV'),
      ('SANTA LUZIA', 'Santa Luzia')
    ON CONFLICT ("name") DO NOTHING
  `);

  // 5. Tabelas do ETL de planilhas (sheets_* — espelho Google Sheets → Postgres)
  await step("sheets_media_rows", sql`
    CREATE TABLE IF NOT EXISTS "sheets_media_rows" (
      "id" serial PRIMARY KEY,
      "date" varchar(10) NOT NULL,
      "hospital" varchar(64) NOT NULL,
      "procedure" varchar(64) NOT NULL,
      "channel" varchar(32) DEFAULT 'GOOGLE' NOT NULL,
      "impressions" integer DEFAULT 0,
      "clicks" integer DEFAULT 0,
      "ctr" numeric(8,6) DEFAULT 0,
      "cost" numeric(12,2) NOT NULL,
      "cpc" numeric(10,4) DEFAULT 0,
      "syncedAt" timestamp DEFAULT now()
    )
  `);
  await step("sheets_media_rows_unique", sql`CREATE UNIQUE INDEX IF NOT EXISTS "sheets_media_rows_unique" ON "sheets_media_rows" ("date","hospital","procedure","channel")`);

  await step("sheets_custos_rows", sql`
    CREATE TABLE IF NOT EXISTS "sheets_custos_rows" (
      "id" serial PRIMARY KEY,
      "date" varchar(10) NOT NULL,
      "channel" varchar(32),
      "campaign" varchar(256),
      "hospital" varchar(64),
      "cost" numeric(12,2) NOT NULL,
      "note" varchar(512),
      "syncedAt" timestamp DEFAULT now()
    )
  `);
  await step("sheets_custos_rows_date_hospital_idx", sql`CREATE INDEX IF NOT EXISTS "sheets_custos_rows_date_hospital_idx" ON "sheets_custos_rows" ("date","hospital")`);
  await step("sheets_custos_rows_unique", sql`CREATE UNIQUE INDEX IF NOT EXISTS "sheets_custos_rows_unique" ON "sheets_custos_rows" ("date","hospital","channel","campaign")`);

  await step("sheets_pipeline_leads", sql`
    CREATE TABLE IF NOT EXISTS "sheets_pipeline_leads" (
      "id" serial PRIMARY KEY,
      "dateEntered" varchar(10) NOT NULL,
      "phone" varchar(32) NOT NULL,
      "name" varchar(256),
      "hospital" varchar(64),
      "procedure" varchar(128),
      "channel" varchar(128),
      "campaign" varchar(256),
      "dateScheduled" varchar(10),
      "dateConsultation" varchar(10),
      "dateSurgery" varchar(10),
      "surgeryValue" numeric(12,2) DEFAULT 0,
      "lossReason" varchar(512),
      "status" varchar(64),
      "syncedAt" timestamp DEFAULT now()
    )
  `);
  await step("sheets_pipeline_leads_unique", sql`CREATE UNIQUE INDEX IF NOT EXISTS "sheets_pipeline_leads_unique" ON "sheets_pipeline_leads" ("dateEntered","phone")`);

  await step("sheets_sync_log", sql`
    CREATE TABLE IF NOT EXISTS "sheets_sync_log" (
      "id" serial PRIMARY KEY,
      "source" varchar(32) NOT NULL,
      "status" varchar(16) NOT NULL,
      "rowsUpserted" integer DEFAULT 0,
      "errorMessage" text,
      "startedAt" timestamp DEFAULT now(),
      "finishedAt" timestamp
    )
  `);

  // 6. Tabela webhook_logs (registro opcional de webhooks recebidos)
  await step("webhook_logs", sql`
    CREATE TABLE IF NOT EXISTS "webhook_logs" (
      "id" serial PRIMARY KEY,
      "receivedAt" timestamp DEFAULT now() NOT NULL,
      "event" varchar(32),
      "instanceUid" varchar(64),
      "contactUid" varchar(64),
      "contactName" varchar(256),
      "contactType" varchar(16),
      "rawPayload" text NOT NULL,
      "createdAt" timestamp DEFAULT now()
    )
  `);
  await step("webhook_logs_receivedAt_idx", sql`CREATE INDEX IF NOT EXISTS "webhook_logs_receivedAt_idx" ON "webhook_logs" ("receivedAt")`);

  console.log("[migrate] Schema de auth + automation + units + sheets + webhook_logs verificado");

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
