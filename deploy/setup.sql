-- ─── WaboxApp Monitor — Schema SQL Postgres ─────────────────────────────────
-- Rode UMA VEZ no banco recém-criado da Render (ou outro Postgres):
--   psql "$DATABASE_URL" -f deploy/setup.sql
--
-- Ou cole no Render Dashboard → Postgres → Shell.
-- ──────────────────────────────────────────────────────────────────────────────

SET client_min_messages = WARNING;

-- ─── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "role" AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "instance_status" AS ENUM ('online', 'offline', 'unknown');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "contact_type" AS ENUM ('user', 'group');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "label_match_type" AS ENUM ('contains', 'starts_with', 'exact');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "message_direction" AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "message_type" AS ENUM (
    'chat', 'image', 'video', 'audio', 'ptt', 'document', 'vcard', 'location', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── users (usuário fixo do painel) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id" SERIAL PRIMARY KEY,
  "openId" VARCHAR(64) NOT NULL,
  "name" TEXT,
  "email" VARCHAR(320),
  "loginMethod" VARCHAR(64),
  "role" "role" NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastSignedIn" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_openId_unique ON "users" ("openId");

-- Insere o usuário fixo do painel (OWNER_ID = 1)
INSERT INTO "users" ("id", "openId", "name", "loginMethod", "role")
VALUES (1, 'panel-owner', 'Rafael', 'password', 'admin')
ON CONFLICT ("openId") DO UPDATE SET "name" = EXCLUDED."name";

-- Garante que a sequência reflete o ID inserido
SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1), true);

-- ─── api_configs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "api_configs" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "token" VARCHAR(256) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS api_configs_userId_idx ON "api_configs" ("userId");

-- ─── instances ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "instances" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "uid" VARCHAR(64) NOT NULL,
  "alias" VARCHAR(128),
  "status" "instance_status" NOT NULL DEFAULT 'unknown',
  "platform" VARCHAR(32),
  "battery" INTEGER,
  "plugged" BOOLEAN DEFAULT FALSE,
  "locale" VARCHAR(16),
  "hookUrl" VARCHAR(512),
  "lastCheckedAt" TIMESTAMP,
  "lastOnlineAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS instances_userId_idx ON "instances" ("userId");
CREATE INDEX IF NOT EXISTS instances_uid_idx ON "instances" ("uid");

-- ─── labels ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "labels" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "name" VARCHAR(64) NOT NULL,
  "color" VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS labels_userId_idx ON "labels" ("userId");

-- ─── label_rules ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "label_rules" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "labelId" INTEGER NOT NULL,
  "keyword" VARCHAR(256) NOT NULL,
  "matchType" "label_match_type" NOT NULL DEFAULT 'contains',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS label_rules_userId_idx ON "label_rules" ("userId");
CREATE INDEX IF NOT EXISTS label_rules_labelId_idx ON "label_rules" ("labelId");

-- ─── contacts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contacts" (
  "id" SERIAL PRIMARY KEY,
  "instanceId" INTEGER NOT NULL,
  "uid" VARCHAR(64) NOT NULL,
  "name" VARCHAR(256),
  "type" "contact_type" NOT NULL DEFAULT 'user',
  "labelId" INTEGER,
  "lastMessageAt" TIMESTAMP,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contacts_instanceId_idx ON "contacts" ("instanceId");
CREATE INDEX IF NOT EXISTS contacts_instanceId_uid_idx ON "contacts" ("instanceId", "uid");
CREATE INDEX IF NOT EXISTS contacts_createdAt_idx ON "contacts" ("createdAt");
CREATE INDEX IF NOT EXISTS contacts_labelId_idx ON "contacts" ("labelId");

-- ─── contact_labels (N:N múltiplos labels) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "contact_labels" (
  "contactId" INTEGER NOT NULL,
  "labelId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("contactId", "labelId")
);
CREATE INDEX IF NOT EXISTS contact_labels_labelId_idx ON "contact_labels" ("labelId");

-- ─── messages ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "messages" (
  "id" SERIAL PRIMARY KEY,
  "instanceId" INTEGER NOT NULL,
  "contactId" INTEGER NOT NULL,
  "muid" VARCHAR(128),
  "cuid" VARCHAR(128),
  "direction" "message_direction" NOT NULL,
  "type" "message_type" NOT NULL DEFAULT 'chat',
  "body" JSONB,
  "ack" INTEGER DEFAULT 0,
  "dtm" BIGINT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_contactId_idx ON "messages" ("contactId");
CREATE INDEX IF NOT EXISTS messages_instanceId_idx ON "messages" ("instanceId");
CREATE INDEX IF NOT EXISTS messages_muid_idx ON "messages" ("muid");
CREATE INDEX IF NOT EXISTS messages_createdAt_idx ON "messages" ("createdAt");
CREATE INDEX IF NOT EXISTS messages_direction_idx ON "messages" ("direction");

-- ─── status_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "status_logs" (
  "id" SERIAL PRIMARY KEY,
  "instanceId" INTEGER NOT NULL,
  "status" "instance_status" NOT NULL,
  "battery" INTEGER,
  "plugged" BOOLEAN,
  "checkedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS status_logs_instanceId_idx ON "status_logs" ("instanceId");
CREATE INDEX IF NOT EXISTS status_logs_checkedAt_idx ON "status_logs" ("checkedAt");

-- ─── Verificação ────────────────────────────────────────────────────────────
SELECT 'Schema criado com sucesso. Tabelas:' AS status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
SELECT id, "openId", name, role FROM "users";
