import {
  pgTable,
  pgEnum,
  serial,
  integer,
  bigint,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const instanceStatusEnum = pgEnum("instance_status", ["online", "offline", "unknown"]);
export const contactTypeEnum = pgEnum("contact_type", ["user", "group"]);
export const labelMatchTypeEnum = pgEnum("label_match_type", ["contains", "starts_with", "exact"]);
export const messageDirectionEnum = pgEnum("message_direction", ["in", "out"]);
export const messageTypeEnum = pgEnum("message_type", [
  "chat",
  "image",
  "video",
  "audio",
  "ptt",
  "document",
  "vcard",
  "location",
  "unknown",
]);

// ─── users ────────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull(),
    /** Identificador de login (rafael, caio…). Lowercase, ASCII, unique. */
    username: varchar("username", { length: 64 }),
    /** Hash bcrypt da senha (nullable pra usuários legados sem senha local). */
    passwordHash: varchar("passwordHash", { length: 128 }),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: roleEnum("role").default("user").notNull(),
    /**
     * Unidades (hospitais) que o usuário pode visualizar.
     * `null` ou `[]` = sem restrição (vê tudo). Admins ignoram este campo.
     * Ex.: ["HOLHOS", "HOPE"]
     */
    allowedHospitals: jsonb("allowedHospitals").$type<string[] | null>(),
    /** Se false, usuário não pode logar. */
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (t) => ({
    openIdUnique: uniqueIndex("users_openId_unique").on(t.openId),
    usernameUnique: uniqueIndex("users_username_unique").on(t.username),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── api_configs ──────────────────────────────────────────────────────────────
export const apiConfigs = pgTable(
  "api_configs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    token: varchar("token", { length: 256 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("api_configs_userId_idx").on(t.userId),
  })
);

export type ApiConfig = typeof apiConfigs.$inferSelect;
export type InsertApiConfig = typeof apiConfigs.$inferInsert;

// ─── instances ────────────────────────────────────────────────────────────────
export const instances = pgTable(
  "instances",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    uid: varchar("uid", { length: 64 }).notNull(),
    alias: varchar("alias", { length: 128 }),
    /**
     * Unidade/hospital ao qual o canal pertence (HOLHOS | HOPE | CBV | CRV |
     * SANTA LUZIA). Nullable — quando vazio, deriva-se de `alias` via
     * `hospitalOf()` como fallback, mantendo canais legados funcionando.
     */
    hospital: varchar("hospital", { length: 64 }),
    status: instanceStatusEnum("status").default("unknown").notNull(),
    platform: varchar("platform", { length: 32 }),
    battery: integer("battery"),
    plugged: boolean("plugged").default(false),
    locale: varchar("locale", { length: 16 }),
    hookUrl: varchar("hookUrl", { length: 512 }),
    lastCheckedAt: timestamp("lastCheckedAt"),
    lastOnlineAt: timestamp("lastOnlineAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("instances_userId_idx").on(t.userId),
    uidIdx: index("instances_uid_idx").on(t.uid),
  })
);

export type Instance = typeof instances.$inferSelect;
export type InsertInstance = typeof instances.$inferInsert;

// ─── labels ───────────────────────────────────────────────────────────────────
export const labels = pgTable(
  "labels",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#6366f1"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("labels_userId_idx").on(t.userId),
  })
);

export type Label = typeof labels.$inferSelect;
export type InsertLabel = typeof labels.$inferInsert;

// ─── label_rules ──────────────────────────────────────────────────────────────
export const labelRules = pgTable(
  "label_rules",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    labelId: integer("labelId").notNull(),
    keyword: varchar("keyword", { length: 256 }).notNull(),
    matchType: labelMatchTypeEnum("matchType").default("contains").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("label_rules_userId_idx").on(t.userId),
    labelIdx: index("label_rules_labelId_idx").on(t.labelId),
  })
);

export type LabelRule = typeof labelRules.$inferSelect;
export type InsertLabelRule = typeof labelRules.$inferInsert;

// ─── contact_labels (N:N) ─────────────────────────────────────────────────────
export const contactLabels = pgTable(
  "contact_labels",
  {
    contactId: integer("contactId").notNull(),
    labelId: integer("labelId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contactId, t.labelId] }),
    labelIdx: index("contact_labels_labelId_idx").on(t.labelId),
  })
);

export type ContactLabel = typeof contactLabels.$inferSelect;
export type InsertContactLabel = typeof contactLabels.$inferInsert;

// ─── contacts ─────────────────────────────────────────────────────────────────
export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    instanceId: integer("instanceId").notNull(),
    uid: varchar("uid", { length: 64 }).notNull(),
    name: varchar("name", { length: 256 }),
    type: contactTypeEnum("type").default("user").notNull(),
    labelId: integer("labelId"),
    lastMessageAt: timestamp("lastMessageAt"),
    messageCount: integer("messageCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({
    instanceIdx: index("contacts_instanceId_idx").on(t.instanceId),
    instanceUidIdx: index("contacts_instanceId_uid_idx").on(t.instanceId, t.uid),
    createdAtIdx: index("contacts_createdAt_idx").on(t.createdAt),
    labelIdx: index("contacts_labelId_idx").on(t.labelId),
  })
);

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── messages ─────────────────────────────────────────────────────────────────
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    instanceId: integer("instanceId").notNull(),
    contactId: integer("contactId").notNull(),
    muid: varchar("muid", { length: 128 }),
    cuid: varchar("cuid", { length: 128 }),
    direction: messageDirectionEnum("direction").notNull(),
    type: messageTypeEnum("type").default("chat").notNull(),
    body: jsonb("body"),
    ack: integer("ack").default(0),
    dtm: bigint("dtm", { mode: "number" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    contactIdx: index("messages_contactId_idx").on(t.contactId),
    instanceIdx: index("messages_instanceId_idx").on(t.instanceId),
    muidIdx: index("messages_muid_idx").on(t.muid),
    createdAtIdx: index("messages_createdAt_idx").on(t.createdAt),
    directionIdx: index("messages_direction_idx").on(t.direction),
  })
);

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── status_logs ──────────────────────────────────────────────────────────────
export const statusLogs = pgTable(
  "status_logs",
  {
    id: serial("id").primaryKey(),
    instanceId: integer("instanceId").notNull(),
    status: instanceStatusEnum("status").notNull(),
    battery: integer("battery"),
    plugged: boolean("plugged"),
    checkedAt: timestamp("checkedAt").defaultNow().notNull(),
  },
  (t) => ({
    instanceIdx: index("status_logs_instanceId_idx").on(t.instanceId),
    checkedAtIdx: index("status_logs_checkedAt_idx").on(t.checkedAt),
  })
);

export type StatusLog = typeof statusLogs.$inferSelect;
export type InsertStatusLog = typeof statusLogs.$inferInsert;

// ─── automation_rules ────────────────────────────────────────────────────────
//
// Regras configuráveis pelo admin pra disparar mensagens automáticas baseadas
// em triggers (lead entrou, sem resposta há X min, mensagem lida sem retorno
// etc) e contexto (hospital, procedimento, palavra-chave de objeção).
export const automationRules = pgTable(
  "automation_rules",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    /** Evento que dispara a regra. */
    trigger: varchar("trigger", { length: 64 }).notNull(),
    /** Hospital alvo (null = qualquer). */
    hospital: varchar("hospital", { length: 64 }),
    /** Lista de palavras-chave/objeções (uma por linha). */
    keywords: text("keywords"),
    /** Atraso pra disparar (em minutos comerciais). */
    delayMinutes: integer("delayMinutes").default(0).notNull(),
    /** Texto da mensagem a enviar — suporta {{nome}}, {{hospital}}, {{procedimento}}. */
    message: text("message").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("automation_rules_userId_idx").on(t.userId),
    triggerIdx: index("automation_rules_trigger_idx").on(t.trigger),
  })
);

export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = typeof automationRules.$inferInsert;

// ─── units (unidades/hospitais) ────────────────────────────────────────────────
//
// Fonte de verdade das unidades. Substitui a lista hardcoded `HOSPITALS`.
// `name` é o slug canônico referenciado em `instances.hospital` e
// `users.allowedHospitals`; `label` é o nome amigável exibido na UI.
export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey(),
    /** Slug canônico (uppercase). Ex.: "HOPE". Referenciado por instances/users. */
    name: varchar("name", { length: 64 }).notNull(),
    /** Nome amigável exibido na UI. Ex.: "Hope". */
    label: varchar("label", { length: 128 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    nameUnique: uniqueIndex("units_name_unique").on(t.name),
  })
);

export type Unit = typeof units.$inferSelect;
export type InsertUnit = typeof units.$inferInsert;

// ─── ETL Google Sheets → Postgres ──────────────────────────────────────────────
//
// Tabelas espelho das planilhas. Populadas periodicamente por server/sheetsSync.ts.
// O dashboard lê daqui; a leitura direta das planilhas (sheetsIngest/mediaInvestment)
// fica como fallback quando estas tabelas ainda estão vazias.

/** NUCLEO — investimento de mídia por hospital×procedimento×canal×dia. */
export const sheetsMediaRows = pgTable(
  "sheets_media_rows",
  {
    id: serial("id").primaryKey(),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
    hospital: varchar("hospital", { length: 64 }).notNull(),
    procedure: varchar("procedure", { length: 64 }).notNull(),
    channel: varchar("channel", { length: 32 }).notNull().default("GOOGLE"),
    impressions: integer("impressions").default(0),
    clicks: integer("clicks").default(0),
    ctr: numeric("ctr", { precision: 8, scale: 6 }).default("0"),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull(),
    cpc: numeric("cpc", { precision: 10, scale: 4 }).default("0"),
    syncedAt: timestamp("syncedAt").defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("sheets_media_rows_unique").on(t.date, t.hospital, t.procedure, t.channel),
  })
);
export type SheetsMediaRow = typeof sheetsMediaRows.$inferSelect;
export type InsertSheetsMediaRow = typeof sheetsMediaRows.$inferInsert;

/** Aba CUSTOS (legado, só Google) — fallback de investimento. */
export const sheetsCustosRows = pgTable(
  "sheets_custos_rows",
  {
    id: serial("id").primaryKey(),
    date: varchar("date", { length: 10 }).notNull(),
    channel: varchar("channel", { length: 32 }),
    campaign: varchar("campaign", { length: 256 }),
    hospital: varchar("hospital", { length: 64 }),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull(),
    note: varchar("note", { length: 512 }),
    syncedAt: timestamp("syncedAt").defaultNow(),
  },
  (t) => ({
    dateHospitalIdx: index("sheets_custos_rows_date_hospital_idx").on(t.date, t.hospital),
    // Chave de upsert (campos coalescidos para "—" no sync, nunca null).
    uniq: uniqueIndex("sheets_custos_rows_unique").on(t.date, t.hospital, t.channel, t.campaign),
  })
);
export type SheetsCustosRow = typeof sheetsCustosRows.$inferSelect;
export type InsertSheetsCustosRow = typeof sheetsCustosRows.$inferInsert;

/** Aba PIPELINE — funil de leads. Chave natural (dateEntered, phone). */
export const sheetsPipelineLeads = pgTable(
  "sheets_pipeline_leads",
  {
    id: serial("id").primaryKey(),
    dateEntered: varchar("dateEntered", { length: 10 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    name: varchar("name", { length: 256 }),
    hospital: varchar("hospital", { length: 64 }),
    procedure: varchar("procedure", { length: 128 }),
    channel: varchar("channel", { length: 128 }),
    campaign: varchar("campaign", { length: 256 }),
    dateScheduled: varchar("dateScheduled", { length: 10 }),
    dateConsultation: varchar("dateConsultation", { length: 10 }),
    dateSurgery: varchar("dateSurgery", { length: 10 }),
    surgeryValue: numeric("surgeryValue", { precision: 12, scale: 2 }).default("0"),
    lossReason: varchar("lossReason", { length: 512 }),
    status: varchar("status", { length: 64 }),
    syncedAt: timestamp("syncedAt").defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("sheets_pipeline_leads_unique").on(t.dateEntered, t.phone),
  })
);
export type SheetsPipelineLead = typeof sheetsPipelineLeads.$inferSelect;
export type InsertSheetsPipelineLead = typeof sheetsPipelineLeads.$inferInsert;

/** Log de sincronização — uma linha por execução de cada source. */
export const sheetsSyncLog = pgTable("sheets_sync_log", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 32 }).notNull(), // media | custos | pipeline
  status: varchar("status", { length: 16 }).notNull(), // success | error | running
  rowsUpserted: integer("rowsUpserted").default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow(),
  finishedAt: timestamp("finishedAt"),
});
export type SheetsSyncLog = typeof sheetsSyncLog.$inferSelect;
export type InsertSheetsSyncLog = typeof sheetsSyncLog.$inferInsert;

// ─── webhook_logs ──────────────────────────────────────────────────────────────
//
// Registro opcional dos webhooks recebidos do WaboxApp (ativado por
// WEBHOOK_LOG=true). Inserção em background; limpeza automática de 7 dias.
export const webhookLogs = pgTable(
  "webhook_logs",
  {
    id: serial("id").primaryKey(),
    receivedAt: timestamp("receivedAt").defaultNow().notNull(),
    event: varchar("event", { length: 32 }),
    instanceUid: varchar("instanceUid", { length: 64 }),
    contactUid: varchar("contactUid", { length: 64 }),
    contactName: varchar("contactName", { length: 256 }),
    contactType: varchar("contactType", { length: 16 }),
    rawPayload: text("rawPayload").notNull(),
    createdAt: timestamp("createdAt").defaultNow(),
  },
  (t) => ({
    receivedAtIdx: index("webhook_logs_receivedAt_idx").on(t.receivedAt),
  })
);
export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = typeof webhookLogs.$inferInsert;
