import { and, asc, desc, eq, gte, inArray, isNull, lte, notExists, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  ApiConfig,
  Contact,
  InsertApiConfig,
  InsertInstance,
  InsertLabel,
  InsertLabelRule,
  InsertMessage,
  InsertStatusLog,
  InsertUser,
  Instance,
  Label,
  LabelRule,
  Message,
  apiConfigs,
  contactLabels,
  contacts,
  instances,
  labelRules,
  labels,
  messages,
  statusLogs,
  users,
} from "../drizzle/schema";
import { instanceHospital } from "./hospitalUtils";

const { Pool } = pg;

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: pg.Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        // Render Postgres exige SSL
        ssl: process.env.DATABASE_URL.includes("render.com") || process.env.PGSSLMODE === "require"
          ? { rejectUnauthorized: false }
          : undefined,
        max: 10,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.openId,
    set: updateSet,
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

// ─── API Config ───────────────────────────────────────────────────────────────

export async function getApiConfig(userId: number): Promise<ApiConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apiConfigs).where(eq(apiConfigs.userId, userId)).limit(1);
  return result[0] ?? undefined;
}

export async function upsertApiConfig(userId: number, token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getApiConfig(userId);
  if (existing) {
    await db.update(apiConfigs).set({ token }).where(eq(apiConfigs.userId, userId));
  } else {
    await db.insert(apiConfigs).values({ userId, token });
  }
}

// ─── Instances ────────────────────────────────────────────────────────────────

export async function getInstances(userId: number): Promise<Instance[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(instances).where(eq(instances.userId, userId)).orderBy(instances.alias);
}

/**
 * Instâncias visíveis para um usuário, respeitando o controle de acesso por
 * unidade. `allowedHospitals` null/vazio = sem restrição (retorna tudo).
 * Para unidades não preenchidas na coluna, o hospital é derivado do alias.
 */
export async function getVisibleInstances(
  userId: number,
  allowedHospitals: string[] | null,
): Promise<Instance[]> {
  const all = await getInstances(userId);
  if (!allowedHospitals || allowedHospitals.length === 0) return all;
  return all.filter((i) => allowedHospitals.includes(instanceHospital(i)));
}

export async function getInstanceById(id: number): Promise<Instance | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(instances).where(eq(instances.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function getInstanceByUid(userId: number, uid: string): Promise<Instance | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(instances)
    .where(and(eq(instances.userId, userId), eq(instances.uid, uid)))
    .limit(1);
  return result[0] ?? undefined;
}

export async function createInstance(data: InsertInstance): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(instances).values(data).returning({ id: instances.id });
  return result[0].id;
}

export async function updateInstanceStatus(
  id: number,
  status: "online" | "offline" | "unknown",
  extra?: {
    alias?: string | null;
    platform?: string | null;
    battery?: number | null;
    plugged?: boolean | null;
    locale?: string | null;
    hookUrl?: string | null;
    lastOnlineAt?: Date | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const updateData: Partial<Instance> = {
    status,
    lastCheckedAt: new Date(),
    ...(extra ?? {}),
  };
  if (status === "online") updateData.lastOnlineAt = new Date();
  await db.update(instances).set(updateData).where(eq(instances.id, id));
}

export async function deleteInstance(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(instances).where(eq(instances.id, id));
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export async function getLabels(userId: number): Promise<Label[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(labels).where(eq(labels.userId, userId)).orderBy(labels.name);
}

export async function createLabel(data: InsertLabel): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(labels).values(data).returning({ id: labels.id });
  return result[0].id;
}

export async function deleteLabel(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // 1) Apaga regras que apontam para esse marcador
  await db.delete(labelRules).where(and(eq(labelRules.labelId, id), eq(labelRules.userId, userId)));
  // 2) Apaga associações N:N em contact_labels (sem FK declarada — limpeza explícita)
  await db.delete(contactLabels).where(eq(contactLabels.labelId, id));
  // 3) Zera o legacy contacts.labelId que ainda aponta pra esse label
  await db.update(contacts).set({ labelId: null }).where(eq(contacts.labelId, id));
  // 4) Finalmente apaga o próprio label
  await db.delete(labels).where(and(eq(labels.id, id), eq(labels.userId, userId)));
}

export async function updateLabel(
  id: number,
  userId: number,
  data: { name?: string; color?: string }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const patch: Partial<{ name: string; color: string }> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.color !== undefined) patch.color = data.color;
  if (Object.keys(patch).length === 0) return;
  await db.update(labels).set(patch).where(and(eq(labels.id, id), eq(labels.userId, userId)));
}

// ─── Label Rules ─────────────────────────────────────────────────────────────

export async function getLabelRules(userId: number): Promise<LabelRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(labelRules).where(eq(labelRules.userId, userId)).orderBy(labelRules.createdAt);
}

export async function createLabelRule(data: InsertLabelRule): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(labelRules).values(data).returning({ id: labelRules.id });
  return result[0].id;
}

export async function deleteLabelRule(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(labelRules).where(and(eq(labelRules.id, id), eq(labelRules.userId, userId)));
}

export async function updateLabelRule(
  id: number,
  userId: number,
  data: { labelId?: number; keyword?: string; matchType?: "contains" | "starts_with" | "exact" }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const patch: Partial<{ labelId: number; keyword: string; matchType: "contains" | "starts_with" | "exact" }> = {};
  if (data.labelId !== undefined) patch.labelId = data.labelId;
  if (data.keyword !== undefined) patch.keyword = data.keyword;
  if (data.matchType !== undefined) patch.matchType = data.matchType;
  if (Object.keys(patch).length === 0) return;
  await db.update(labelRules).set(patch).where(and(eq(labelRules.id, id), eq(labelRules.userId, userId)));
}

/**
 * Engine de marcadores: verifica regras do usuário e retorna labelId que casa (ou null).
 */
export async function matchLabelForMessage(
  userId: number,
  messageText: string
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const rules = await db
    .select({
      id: labelRules.id,
      labelId: labelRules.labelId,
      keyword: labelRules.keyword,
      matchType: labelRules.matchType,
    })
    .from(labelRules)
    .where(eq(labelRules.userId, userId))
    .orderBy(labelRules.createdAt);

  const text = messageText.toLowerCase().trim();

  for (const rule of rules) {
    const kw = rule.keyword.toLowerCase().trim();
    let matched = false;
    if (rule.matchType === "exact") {
      matched = text === kw;
    } else if (rule.matchType === "starts_with") {
      matched = text.startsWith(kw);
    } else {
      matched = text.includes(kw);
    }
    if (matched) return rule.labelId;
  }

  return null;
}

export async function applyLabelToContact(contactId: number, labelId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(contacts).set({ labelId }).where(
    and(eq(contacts.id, contactId), sql`${contacts.labelId} IS NULL`)
  );
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export type ContactWithLabel = Contact & {
  labelName?: string | null;
  labelColor?: string | null;
  firstMessageAt: Date;
  instanceAlias?: string | null;
  instanceUid?: string | null;
};

const CONTACT_SELECT = {
  id: contacts.id,
  instanceId: contacts.instanceId,
  uid: contacts.uid,
  name: contacts.name,
  type: contacts.type,
  labelId: contacts.labelId,
  lastMessageAt: contacts.lastMessageAt,
  messageCount: contacts.messageCount,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
  labelName: labels.name,
  labelColor: labels.color,
};

export async function getContacts(
  instanceId: number,
  opts?: { dateFrom?: Date; dateTo?: Date; labelId?: number | null }
): Promise<ContactWithLabel[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(contacts.instanceId, instanceId)];
  if (opts?.dateFrom) conditions.push(gte(contacts.createdAt, opts.dateFrom));
  if (opts?.dateTo) {
    const endOfDay = new Date(opts.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.createdAt, endOfDay));
  }
  if (opts?.labelId != null) conditions.push(eq(contacts.labelId, opts.labelId));

  const rows = await db
    .select(CONTACT_SELECT)
    .from(contacts)
    .leftJoin(labels, eq(contacts.labelId, labels.id))
    .where(and(...conditions))
    .orderBy(desc(contacts.lastMessageAt));

  return rows.map((r) => ({ ...r, firstMessageAt: r.createdAt }));
}

export async function getAllContacts(
  instanceIds: number[],
  opts?: { dateFrom?: Date; dateTo?: Date; labelId?: number | null }
): Promise<ContactWithLabel[]> {
  const db = await getDb();
  if (!db || instanceIds.length === 0) return [];

  const conditions = [inArray(contacts.instanceId, instanceIds)];
  if (opts?.dateFrom) conditions.push(gte(contacts.createdAt, opts.dateFrom));
  if (opts?.dateTo) {
    const endOfDay = new Date(opts.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(contacts.createdAt, endOfDay));
  }
  if (opts?.labelId != null) conditions.push(eq(contacts.labelId, opts.labelId));

  const rows = await db
    .select({
      ...CONTACT_SELECT,
      instanceAlias: instances.alias,
      instanceUid: instances.uid,
    })
    .from(contacts)
    .leftJoin(labels, eq(contacts.labelId, labels.id))
    .leftJoin(instances, eq(contacts.instanceId, instances.id))
    .where(and(...conditions))
    .orderBy(desc(contacts.lastMessageAt));

  return rows.map((r) => ({ ...r, firstMessageAt: r.createdAt }));
}

export async function upsertContact(
  instanceId: number,
  uid: string,
  name?: string | null,
  type: "user" | "group" = "user"
): Promise<{ id: number; isNew: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.instanceId, instanceId), eq(contacts.uid, uid)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(contacts)
      .set({
        name: name ?? existing[0].name,
        lastMessageAt: new Date(),
        messageCount: sql`${contacts.messageCount} + 1`,
      })
      .where(eq(contacts.id, existing[0].id));
    return { id: existing[0].id, isNew: false };
  } else {
    const result = await db
      .insert(contacts)
      .values({
        instanceId,
        uid,
        name: name ?? null,
        type,
        lastMessageAt: new Date(),
        messageCount: 1,
      })
      .returning({ id: contacts.id });
    return { id: result[0].id, isNew: true };
  }
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface DailyContactStat {
  date: string;       // YYYY-MM-DD
  newContacts: number;
  totalMessages: number;
}

export async function getDailyContactStats(
  instanceId: number,
  days = 30
): Promise<DailyContactStat[]> {
  const db = await getDb();
  if (!db) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Postgres: to_char(col, 'YYYY-MM-DD') retorna string igual ao DATE() do MySQL
  const newContactsRows = await db
    .select({
      date: sql<string>`to_char(${contacts.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(contacts)
    .where(and(eq(contacts.instanceId, instanceId), gte(contacts.createdAt, since)))
    .groupBy(sql`to_char(${contacts.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${contacts.createdAt}, 'YYYY-MM-DD')`);

  const messagesRows = await db
    .select({
      date: sql<string>`to_char(${messages.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(messages)
    .where(and(eq(messages.instanceId, instanceId), gte(messages.createdAt, since)))
    .groupBy(sql`to_char(${messages.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${messages.createdAt}, 'YYYY-MM-DD')`);

  const statsMap = new Map<string, DailyContactStat>();

  for (const row of newContactsRows) {
    statsMap.set(row.date, { date: row.date, newContacts: Number(row.count), totalMessages: 0 });
  }
  for (const row of messagesRows) {
    const existing = statsMap.get(row.date);
    if (existing) {
      existing.totalMessages = Number(row.count);
    } else {
      statsMap.set(row.date, { date: row.date, newContacts: 0, totalMessages: Number(row.count) });
    }
  }

  return Array.from(statsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function getMessages(
  contactId: number,
  limit = 100,
  offset = 0
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.contactId, contactId))
    .orderBy(messages.dtm)
    .limit(limit)
    .offset(offset);
}

/**
 * Retorna todos os contatos com todo o texto agregado das mensagens — usado
 * pra inferir Catarata vs Refrativa em batch quando exportamos pra PIPELINE.
 */
export interface LeadWithText {
  id: number;
  uid: string;
  name: string | null;
  type: "user" | "group";
  instanceId: number;
  instanceAlias: string | null;
  instanceHospital: string | null;
  createdAt: Date;
  messageCount: number;
  allText: string;
}

export async function getLeadsWithAggregatedText(
  instanceIds: number[]
): Promise<LeadWithText[]> {
  const db = await getDb();
  if (!db || instanceIds.length === 0) return [];

  // IDs vêm do nosso DB e são integers — interpolar literal é seguro
  const idList = instanceIds.filter((n) => Number.isInteger(n)).join(",");
  if (!idList) return [];

  // Query única: agrega body->text e body->caption por contato
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.uid,
      c.name,
      c.type::text AS type,
      c."instanceId",
      i.alias AS "instanceAlias",
      i.hospital AS "instanceHospital",
      c."createdAt",
      c."messageCount",
      COALESCE(string_agg(
        COALESCE(m.body->>'text', m.body->>'caption', ''),
        ' '
      ), '') AS "allText"
    FROM contacts c
    LEFT JOIN instances i ON i.id = c."instanceId"
    LEFT JOIN messages m ON m."contactId" = c.id
    WHERE c."instanceId" IN (${sql.raw(idList)})
    GROUP BY c.id, c.uid, c.name, c.type, c."instanceId", i.alias, i.hospital, c."createdAt", c."messageCount"
    ORDER BY c."createdAt" ASC
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows.rows as any[]).map((r) => ({
    id: Number(r.id),
    uid: String(r.uid),
    name: r.name ?? null,
    type: r.type as "user" | "group",
    instanceId: Number(r.instanceId),
    instanceAlias: r.instanceAlias ?? null,
    instanceHospital: r.instanceHospital ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
    messageCount: Number(r.messageCount ?? 0),
    allText: String(r.allText ?? ""),
  }));
}

export async function insertMessage(data: InsertMessage): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(messages).values(data).returning({ id: messages.id });
  return result[0].id;
}

export async function updateMessageAck(muid: string, ack: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(messages).set({ ack }).where(eq(messages.muid, muid));
}

export async function getMessageCountForContact(contactId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(messages)
    .where(eq(messages.contactId, contactId));
  return Number(result[0]?.count ?? 0);
}

// ─── Dashboard Overview ─────────────────────────────────────────────────────

export interface DashboardOverview {
  totalContacts: number;
  newContactsToday: number;
  newContactsYesterday: number;
  newContactsThisWeek: number;
  newContactsThisMonth: number;
  totalLeadsInPeriod: number;
  contactedLeadsInPeriod: number;
  contactedLeadsPercent: number;
  validLeadsPercent: number;          // % com ≥1 inbound (cliente respondeu)
  invalidLeadsPercent: number;        // 100 - validLeadsPercent
  avgTimeToFirstContactMinutes: number | null;  // tempo médio até 1ª outbound
  respondedWithin5MinPercent: number; // % com 1ª outbound em ≤5min após createdAt
  totalMessages: number;
  messagesLast24h: number;
  instancesOnline: number;
  instancesOffline: number;
  instancesTotal: number;
  dailySeries: Array<{ date: string; newContacts: number; messages: number }>;
  labelDistribution: Array<{ labelId: number; labelName: string; labelColor: string; count: number }>;
  operationDistribution: Array<{ instanceId: number; alias: string; uid: string; color: string; count: number }>;
  topInstances: Array<{ instanceId: number; alias: string; uid: string; contactCount: number; messageCount: number; status: string }>;
  hourlyHeatmap: Array<{ hour: number; count: number }>;
  instanceUptime: Array<{ instanceId: number; alias: string; uptimePercent: number; totalChecks: number; onlineChecks: number }>;
  avgResponseTimeMinutes: number | null;
}

export async function getDashboardOverview(
  userId: number,
  opts?: { dateFrom?: Date; dateTo?: Date; hospitals?: string[]; procedures?: string[]; visibleInstanceIds?: number[] }
): Promise<DashboardOverview> {
  const db = await getDb();
  const emptyResult: DashboardOverview = {
    totalContacts: 0, newContactsToday: 0, newContactsYesterday: 0,
    newContactsThisWeek: 0, newContactsThisMonth: 0,
    totalLeadsInPeriod: 0, contactedLeadsInPeriod: 0, contactedLeadsPercent: 0,
    validLeadsPercent: 0, invalidLeadsPercent: 0,
    avgTimeToFirstContactMinutes: null, respondedWithin5MinPercent: 0,
    totalMessages: 0, messagesLast24h: 0,
    instancesOnline: 0, instancesOffline: 0, instancesTotal: 0,
    dailySeries: [], labelDistribution: [], operationDistribution: [], topInstances: [], hourlyHeatmap: [],
    instanceUptime: [], avgResponseTimeMinutes: null,
  };
  if (!db) return emptyResult;

  const allUserInstancesRaw = await db.select().from(instances).where(eq(instances.userId, userId));
  // Controle de acesso por unidade: restringe ao conjunto visível, quando informado.
  const allUserInstances = opts?.visibleInstanceIds
    ? allUserInstancesRaw.filter((i) => opts.visibleInstanceIds!.includes(i.id))
    : allUserInstancesRaw;

  // Filtra instâncias por hospital/procedimento via mapeamento manual (alias → hospital/procedures)
  const { mapInstanceToHospital } = await import("./mediaInvestment");
  const userInstances = allUserInstances.filter((inst) => {
    if (!opts?.hospitals?.length && !opts?.procedures?.length) return true;
    const m = mapInstanceToHospital(inst.alias);
    if (opts.hospitals?.length && (!m.hospital || !opts.hospitals.includes(m.hospital))) return false;
    if (opts.procedures?.length && !opts.procedures.some((p) => m.procedures.includes(p))) return false;
    return true;
  });

  const instanceIds = userInstances.map((i) => i.id);
  if (instanceIds.length === 0) return {
    ...emptyResult,
    instancesOnline: userInstances.filter((i) => i.status === 'online').length,
    instancesOffline: userInstances.filter((i) => i.status === 'offline').length,
    instancesTotal: userInstances.length,
  };

  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const endOfYesterday = new Date(startOfToday); endOfYesterday.setMilliseconds(-1);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfMonth = new Date(startOfToday); startOfMonth.setDate(startOfMonth.getDate() - 30);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const periodStart = opts?.dateFrom ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date(opts?.dateTo ?? now);
  periodEnd.setHours(23, 59, 59, 999);

  const [totalContactsRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(contacts).where(inArray(contacts.instanceId, instanceIds));
  const [todayRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(contacts).where(and(inArray(contacts.instanceId, instanceIds), gte(contacts.createdAt, startOfToday)));
  const [yesterdayRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(contacts).where(and(inArray(contacts.instanceId, instanceIds), gte(contacts.createdAt, startOfYesterday), lte(contacts.createdAt, endOfYesterday)));
  const [weekRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(contacts).where(and(inArray(contacts.instanceId, instanceIds), gte(contacts.createdAt, startOfWeek)));
  const [monthRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(contacts).where(and(inArray(contacts.instanceId, instanceIds), gte(contacts.createdAt, startOfMonth)));

  const [totalMsgRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(messages).where(inArray(messages.instanceId, instanceIds));
  const [msg24hRow] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(messages).where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last24h)));

  // Série diária (Postgres usa to_char em vez de DATE())
  const dailyContactsRows = await db.select({
    date: sql<string>`to_char(contacts."createdAt", 'YYYY-MM-DD')`,
    count: sql<number>`COUNT(*)::int`,
  }).from(contacts).where(and(inArray(contacts.instanceId, instanceIds), gte(contacts.createdAt, periodStart), lte(contacts.createdAt, periodEnd))).groupBy(sql`to_char(contacts."createdAt", 'YYYY-MM-DD')`).orderBy(sql`to_char(contacts."createdAt", 'YYYY-MM-DD')`);

  const dailyMsgRows = await db.select({
    date: sql<string>`to_char(messages."createdAt", 'YYYY-MM-DD')`,
    count: sql<number>`COUNT(*)::int`,
  }).from(messages).where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, periodStart), lte(messages.createdAt, periodEnd))).groupBy(sql`to_char(messages."createdAt", 'YYYY-MM-DD')`).orderBy(sql`to_char(messages."createdAt", 'YYYY-MM-DD')`);

  const dailyMap = new Map<string, { newContacts: number; messages: number }>();
  for (const r of dailyContactsRows) dailyMap.set(r.date, { newContacts: Number(r.count), messages: 0 });
  for (const r of dailyMsgRows) {
    const ex = dailyMap.get(r.date);
    if (ex) ex.messages = Number(r.count);
    else dailyMap.set(r.date, { newContacts: 0, messages: Number(r.count) });
  }
  const dailySeries = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));

  // Distribuição por etiqueta
  const labelDist = await db.select({
    labelId: labels.id,
    labelName: labels.name,
    labelColor: labels.color,
    count: sql<number>`COUNT(${contacts.id})::int`,
  }).from(contacts)
    .innerJoin(labels, eq(contacts.labelId, labels.id))
    .where(and(inArray(contacts.instanceId, instanceIds), eq(labels.userId, userId)))
    .groupBy(labels.id, labels.name, labels.color)
    .orderBy(desc(sql`COUNT(${contacts.id})`));

  // Top instâncias
  const topInst = await db.select({
    instanceId: instances.id,
    alias: instances.alias,
    uid: instances.uid,
    status: instances.status,
    contactCount: sql<number>`COUNT(DISTINCT ${contacts.id})::int`,
    messageCount: sql<number>`COUNT(${messages.id})::int`,
  }).from(instances)
    .leftJoin(contacts, eq(contacts.instanceId, instances.id))
    .leftJoin(messages, eq(messages.instanceId, instances.id))
    .where(eq(instances.userId, userId))
    .groupBy(instances.id, instances.alias, instances.uid, instances.status)
    .orderBy(desc(sql`COUNT(${messages.id})`));

  // Distribuição de leads por operação (instância) no período filtrado
  const opDist = await db.select({
    instanceId: instances.id,
    alias: instances.alias,
    uid: instances.uid,
    count: sql<number>`COUNT(${contacts.id})::int`,
  }).from(instances)
    .leftJoin(
      contacts,
      and(
        eq(contacts.instanceId, instances.id),
        gte(contacts.createdAt, periodStart),
        lte(contacts.createdAt, periodEnd),
      ),
    )
    .where(eq(instances.userId, userId))
    .groupBy(instances.id, instances.alias, instances.uid)
    .orderBy(desc(sql`COUNT(${contacts.id})`));

  // Paleta estável (mesma ordem do retorno → mesma cor entre refetches)
  const opPalette = [
    "#DFFF00", // sougni lime (destaque)
    "#3B82F6", // blue-500
    "#10B981", // emerald-500
    "#F59E0B", // amber-500
    "#EC4899", // pink-500
    "#8B5CF6", // violet-500
    "#06B6D4", // cyan-500
    "#F97316", // orange-500
    "#84CC16", // lime-500
    "#14B8A6", // teal-500
  ];
  const operationDistribution = opDist
    .filter((r) => Number(r.count) > 0)
    .map((r, i) => ({
      instanceId: r.instanceId,
      alias: r.alias ?? r.uid,
      uid: r.uid,
      color: opPalette[i % opPalette.length],
      count: Number(r.count),
    }));

  // Total de leads no período + % contatados (têm ≥1 msg outbound de operador)
  const [periodLeadsRow] = await db.select({
    count: sql<number>`COUNT(*)::int`,
  }).from(contacts).where(and(
    inArray(contacts.instanceId, instanceIds),
    gte(contacts.createdAt, periodStart),
    lte(contacts.createdAt, periodEnd),
  ));

  const [periodContactedRow] = await db.select({
    count: sql<number>`COUNT(DISTINCT ${contacts.id})::int`,
  }).from(contacts)
    .innerJoin(messages, and(
      eq(messages.contactId, contacts.id),
      eq(messages.direction, "out"),
    ))
    .where(and(
      inArray(contacts.instanceId, instanceIds),
      gte(contacts.createdAt, periodStart),
      lte(contacts.createdAt, periodEnd),
    ));

  const totalLeadsInPeriod = Number(periodLeadsRow?.count ?? 0);
  const contactedLeadsInPeriod = Number(periodContactedRow?.count ?? 0);
  const contactedLeadsPercent = totalLeadsInPeriod > 0
    ? Math.round((contactedLeadsInPeriod / totalLeadsInPeriod) * 100)
    : 0;

  // Leads válidos = contatos no período com ≥1 mensagem INBOUND (cliente respondeu)
  const [periodValidRow] = await db.select({
    count: sql<number>`COUNT(DISTINCT ${contacts.id})::int`,
  }).from(contacts)
    .innerJoin(messages, and(
      eq(messages.contactId, contacts.id),
      eq(messages.direction, "in"),
    ))
    .where(and(
      inArray(contacts.instanceId, instanceIds),
      gte(contacts.createdAt, periodStart),
      lte(contacts.createdAt, periodEnd),
    ));

  const validLeadsCount = Number(periodValidRow?.count ?? 0);
  const validLeadsPercent = totalLeadsInPeriod > 0
    ? Math.round((validLeadsCount / totalLeadsInPeriod) * 100)
    : 0;
  const invalidLeadsPercent = totalLeadsInPeriod > 0 ? 100 - validLeadsPercent : 0;

  // Tempo até primeiro contato (1ª outbound) — média em minutos
  // E % atendidos em ≤5min (em relação ao total de leads do período)
  const firstOutSubquery = sql`
    SELECT contacts.id AS contact_id, contacts."createdAt" AS lead_at,
           MIN(messages."createdAt") AS first_out_at
    FROM contacts
    INNER JOIN messages ON messages."contactId" = contacts.id AND messages.direction = 'out'
    WHERE contacts."instanceId" = ANY(${sql.raw(`ARRAY[${instanceIds.join(",")}]::int[]`)})
      AND contacts."createdAt" >= ${periodStart}
      AND contacts."createdAt" <= ${periodEnd}
    GROUP BY contacts.id, contacts."createdAt"
  `;

  const timeStatsResult = await db.execute(sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM (first_out_at - lead_at)) / 60.0) AS avg_minutes,
      COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (first_out_at - lead_at)) <= 300) AS within_5min,
      COUNT(*) AS attended_count
    FROM (${firstOutSubquery}) AS first_outs
    WHERE first_out_at >= lead_at
  `);
  const timeStatsRow = (timeStatsResult as unknown as { rows: Array<{ avg_minutes: string | null; within_5min: string; attended_count: string }> }).rows[0];

  const avgTimeToFirstContactMinutes = timeStatsRow?.avg_minutes != null
    ? Math.round(Number(timeStatsRow.avg_minutes) * 10) / 10
    : null;
  const within5MinCount = Number(timeStatsRow?.within_5min ?? 0);
  const respondedWithin5MinPercent = totalLeadsInPeriod > 0
    ? Math.round((within5MinCount / totalLeadsInPeriod) * 100)
    : 0;

  // Heatmap por hora (Postgres usa EXTRACT)
  const hourlyRows = await db.select({
    hour: sql<number>`EXTRACT(hour FROM messages."createdAt")::int`,
    count: sql<number>`COUNT(*)::int`,
  }).from(messages).where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, periodStart), lte(messages.createdAt, periodEnd))).groupBy(sql`EXTRACT(hour FROM messages."createdAt")`).orderBy(sql`EXTRACT(hour FROM messages."createdAt")`);

  const hourlyMap = new Map<number, number>();
  for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);
  for (const r of hourlyRows) hourlyMap.set(Number(r.hour), Number(r.count));
  const hourlyHeatmap = Array.from(hourlyMap.entries()).map(([hour, count]) => ({ hour, count }));

  // Uptime (Postgres SUM CASE WHEN funciona normal)
  const uptimeData = await Promise.all(userInstances.map(async (inst) => {
    const [row] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      online: sql<number>`COALESCE(SUM(CASE WHEN ${statusLogs.status} = 'online' THEN 1 ELSE 0 END), 0)::int`,
    }).from(statusLogs).where(eq(statusLogs.instanceId, inst.id));
    const total = Number(row?.total ?? 0);
    const online = Number(row?.online ?? 0);
    return {
      instanceId: inst.id,
      alias: inst.alias ?? inst.uid,
      uptimePercent: total > 0 ? Math.round((online / total) * 100) : 0,
      totalChecks: total,
      onlineChecks: online,
    };
  }));

  return {
    totalContacts: Number(totalContactsRow?.count ?? 0),
    newContactsToday: Number(todayRow?.count ?? 0),
    newContactsYesterday: Number(yesterdayRow?.count ?? 0),
    newContactsThisWeek: Number(weekRow?.count ?? 0),
    newContactsThisMonth: Number(monthRow?.count ?? 0),
    totalLeadsInPeriod,
    contactedLeadsInPeriod,
    contactedLeadsPercent,
    validLeadsPercent,
    invalidLeadsPercent,
    avgTimeToFirstContactMinutes,
    respondedWithin5MinPercent,
    totalMessages: Number(totalMsgRow?.count ?? 0),
    messagesLast24h: Number(msg24hRow?.count ?? 0),
    instancesOnline: userInstances.filter((i) => i.status === 'online').length,
    instancesOffline: userInstances.filter((i) => i.status === 'offline').length,
    instancesTotal: userInstances.length,
    dailySeries,
    labelDistribution: labelDist.map((r) => ({ ...r, count: Number(r.count) })),
    operationDistribution,
    topInstances: topInst.map((r) => ({ ...r, contactCount: Number(r.contactCount), messageCount: Number(r.messageCount), alias: r.alias ?? r.uid })),
    hourlyHeatmap,
    instanceUptime: uptimeData,
    avgResponseTimeMinutes: null,
  };
}

// ─── Status Logs ─────────────────────────────────────────────────────────────

export async function insertStatusLog(data: InsertStatusLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(statusLogs).values(data);
}

export async function getStatusLogs(instanceId: number, limit = 50): Promise<typeof statusLogs.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(statusLogs)
    .where(eq(statusLogs.instanceId, instanceId))
    .orderBy(desc(statusLogs.checkedAt))
    .limit(limit);
}

// ─── Realtime Pulse ───────────────────────────────────────────────────────────

export async function getRealtimePulse(userId: number, visibleInstanceIds?: number[]) {
  const db = await getDb();
  if (!db) return null;

  const userInstancesRaw = await db.select().from(instances).where(eq(instances.userId, userId));
  const userInstances = visibleInstanceIds
    ? userInstancesRaw.filter((i) => visibleInstanceIds.includes(i.id))
    : userInstancesRaw;
  if (!userInstances.length) return null;
  const instanceIds = userInstances.map((i) => i.id);

  const now = new Date();
  const last1min = new Date(now.getTime() - 60 * 1000);
  const last5min = new Date(now.getTime() - 5 * 60 * 1000);
  const last15min = new Date(now.getTime() - 15 * 60 * 1000);
  const last1h = new Date(now.getTime() - 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);

  const [msgs1min] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last1min)));
  const [msgs5min] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last5min)));
  const [msgs15min] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last15min)));
  const [msgs1h] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last1h)));

  const [msgsIn1h] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last1h), eq(messages.direction, 'in')));
  const [msgsOut1h] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last1h), eq(messages.direction, 'out')));

  const [leads1h] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(contacts)
    .where(and(inArray(contacts.instanceId, instanceIds), gte(contacts.createdAt, last1h)));
  const [leadsToday] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(contacts)
    .where(and(inArray(contacts.instanceId, instanceIds), gte(contacts.createdAt, startOfToday)));

  const [lastMsgRow] = await db.select({
    id: messages.id,
    direction: messages.direction,
    type: messages.type,
    body: messages.body,
    dtm: messages.dtm,
    createdAt: messages.createdAt,
    instanceId: messages.instanceId,
    contactId: messages.contactId,
  }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), eq(messages.direction, 'in')))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  let lastMsgContactName: string | null = null;
  let lastMsgContactUid: string | null = null;
  let lastMsgInstanceAlias: string | null = null;
  let lastMsgInstanceUid: string | null = null;
  if (lastMsgRow) {
    const [contactRow] = await db.select({ name: contacts.name, uid: contacts.uid }).from(contacts)
      .where(eq(contacts.id, lastMsgRow.contactId)).limit(1);
    lastMsgContactName = contactRow?.name ?? contactRow?.uid ?? null;
    lastMsgContactUid = contactRow?.uid ?? null;
    const inst = userInstances.find((i) => i.id === lastMsgRow.instanceId);
    lastMsgInstanceAlias = inst?.alias ?? inst?.uid ?? null;
    lastMsgInstanceUid = inst?.uid ?? null;
  }

  const [topContactRow] = await db.select({
    contactId: messages.contactId,
    count: sql<number>`COUNT(*)::int`,
  }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last24h)))
    .groupBy(messages.contactId)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(1);

  let topContactName: string | null = null;
  let topContactUid: string | null = null;
  let topContactInstanceId: number | null = null;
  let topContactInstanceAlias: string | null = null;
  let topContactMsgCount = 0;
  if (topContactRow) {
    const [cRow] = await db.select({ name: contacts.name, uid: contacts.uid, instanceId: contacts.instanceId })
      .from(contacts).where(eq(contacts.id, topContactRow.contactId)).limit(1);
    topContactName = cRow?.name ?? cRow?.uid ?? null;
    topContactUid = cRow?.uid ?? null;
    topContactInstanceId = cRow?.instanceId ?? null;
    const inst = userInstances.find((i) => i.id === topContactInstanceId);
    topContactInstanceAlias = inst?.alias ?? inst?.uid ?? null;
    topContactMsgCount = Number(topContactRow.count);
  }

  const lowBatteryInstances = userInstances
    .filter((i) => i.battery !== null && i.battery !== undefined && i.battery < 20)
    .map((i) => ({ alias: i.alias ?? i.uid, battery: i.battery! }));

  const instancesStatus = userInstances.map((i) => ({
    id: i.id,
    alias: i.alias ?? i.uid,
    uid: i.uid,
    status: i.status,
    battery: i.battery,
    plugged: i.plugged,
    lastOnlineAt: i.lastOnlineAt,
  }));

  const recentMsgs = await db.select({
    id: messages.id,
    direction: messages.direction,
    type: messages.type,
    body: messages.body,
    createdAt: messages.createdAt,
    instanceId: messages.instanceId,
    contactId: messages.contactId,
  }).from(messages)
    .where(and(inArray(messages.instanceId, instanceIds), gte(messages.createdAt, last24h)))
    .orderBy(desc(messages.createdAt))
    .limit(10);

  const recentContactIds = Array.from(new Set(recentMsgs.map((m) => m.contactId)));
  const recentContactsMap = new Map<number, { name: string | null; uid: string }>();

  if (recentContactIds.length > 0) {
    const recentContactRows = await db
      .select({ id: contacts.id, name: contacts.name, uid: contacts.uid })
      .from(contacts)
      .where(inArray(contacts.id, recentContactIds));
    for (const c of recentContactRows) {
      recentContactsMap.set(c.id, { name: c.name, uid: c.uid });
    }
  }

  const recentFeed = recentMsgs.map((m) => {
    const contact = recentContactsMap.get(m.contactId);
    const inst = userInstances.find((i) => i.id === m.instanceId);
    const body = m.body as Record<string, unknown> | null;
    const text = body?.text as string | undefined;
    return {
      id: m.id,
      direction: m.direction,
      type: m.type,
      text: text ?? null,
      createdAt: m.createdAt,
      contactId: m.contactId,
      contactName: contact?.name ?? contact?.uid ?? 'Desconhecido',
      contactUid: contact?.uid ?? null,
      instanceId: m.instanceId,
      instanceAlias: inst?.alias ?? inst?.uid ?? '?',
      instanceUid: inst?.uid ?? null,
    };
  });

  return {
    msgsLast1min: Number(msgs1min?.count ?? 0),
    msgsLast5min: Number(msgs5min?.count ?? 0),
    msgsLast15min: Number(msgs15min?.count ?? 0),
    msgsLast1h: Number(msgs1h?.count ?? 0),
    msgsIn1h: Number(msgsIn1h?.count ?? 0),
    msgsOut1h: Number(msgsOut1h?.count ?? 0),
    leadsLast1h: Number(leads1h?.count ?? 0),
    leadsToday: Number(leadsToday?.count ?? 0),
    lastMessage: lastMsgRow ? {
      type: lastMsgRow.type,
      createdAt: lastMsgRow.createdAt,
      contactId: lastMsgRow.contactId,
      contactName: lastMsgContactName,
      contactUid: lastMsgContactUid,
      instanceId: lastMsgRow.instanceId,
      instanceAlias: lastMsgInstanceAlias,
      instanceUid: lastMsgInstanceUid,
    } : null,
    topContact: topContactName ? {
      name: topContactName,
      contactId: topContactRow?.contactId ?? null,
      contactUid: topContactUid,
      instanceId: topContactInstanceId,
      instanceAlias: topContactInstanceAlias,
      msgCount: topContactMsgCount,
    } : null,
    instancesStatus,
    lowBatteryInstances,
    onlineCount: userInstances.filter((i) => i.status === 'online').length,
    offlineCount: userInstances.filter((i) => i.status === 'offline').length,
    totalInstances: userInstances.length,
    recentFeed,
    generatedAt: now,
  };
}

// ─── Label Rules: 4 primeiras mensagens ──────────────────────────────────────

export async function getFirstInboundMessages(
  contactId: number,
  limit: number = 4
): Promise<Array<{ id: number; body: unknown; direction: string }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      direction: messages.direction,
    })
    .from(messages)
    .where(
      and(
        eq(messages.contactId, contactId),
        eq(messages.direction, "in")
      )
    )
    .orderBy(asc(messages.dtm), asc(messages.id))
    .limit(limit);
  return rows;
}

export async function contactHasLabel(contactId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ cnt: sql<number>`COUNT(*)::int` })
    .from(contactLabels)
    .where(eq(contactLabels.contactId, contactId))
    .limit(1);
  return Number(row?.cnt ?? 0) > 0;
}

export async function matchAllLabelsForMessages(
  userId: number,
  messageTexts: string[]
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const validTexts = messageTexts
    .map((t) => (typeof t === "string" ? t.toLowerCase().trim() : ""))
    .filter((t) => t.length > 0);

  if (validTexts.length === 0) return [];

  const rules = await db
    .select({
      id: labelRules.id,
      labelId: labelRules.labelId,
      keyword: labelRules.keyword,
      matchType: labelRules.matchType,
    })
    .from(labelRules)
    .where(eq(labelRules.userId, userId))
    .orderBy(asc(labelRules.createdAt));

  const matchedIds = new Set<number>();

  for (const rule of rules) {
    const kw = rule.keyword.toLowerCase().trim();
    for (const text of validTexts) {
      let matched = false;
      if (rule.matchType === "exact") {
        matched = text === kw;
      } else if (rule.matchType === "starts_with") {
        matched = text.startsWith(kw);
      } else {
        matched = text.includes(kw);
      }
      if (matched) {
        matchedIds.add(rule.labelId);
        break;
      }
    }
  }

  return Array.from(matchedIds);
}

export async function matchLabelForMessages(
  userId: number,
  messageTexts: string[]
): Promise<number | null> {
  const ids = await matchAllLabelsForMessages(userId, messageTexts);
  return ids[0] ?? null;
}

/**
 * Aplica MÚLTIPLOS labels a um contato — Postgres usa onConflictDoNothing.
 */
export async function applyLabelsToContact(contactId: number, labelIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db || labelIds.length === 0) return;

  for (const labelId of labelIds) {
    await db
      .insert(contactLabels)
      .values({ contactId, labelId })
      .onConflictDoNothing({
        target: [contactLabels.contactId, contactLabels.labelId],
      });
  }

  await db
    .update(contacts)
    .set({ labelId: labelIds[0] })
    .where(and(eq(contacts.id, contactId), isNull(contacts.labelId)));
}

export async function getContactLabels(
  contactId: number
): Promise<{ id: number; name: string; color: string }[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(contactLabels)
    .innerJoin(labels, eq(contactLabels.labelId, labels.id))
    .where(eq(contactLabels.contactId, contactId));
}

/**
 * Substitui ATOMICAMENTE o conjunto de marcadores de um contato.
 * Usado pela UI manual de aplicar/remover marcadores (multi-select).
 *
 * Apaga tudo de contact_labels do contato e re-insere apenas os labelIds dados.
 * Também sincroniza o legacy contacts.labelId (1º label ou null).
 */
export async function setContactLabels(contactId: number, labelIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const uniq = Array.from(new Set(labelIds.filter((n) => Number.isFinite(n))));

  await db.delete(contactLabels).where(eq(contactLabels.contactId, contactId));
  if (uniq.length > 0) {
    await db.insert(contactLabels).values(uniq.map((labelId) => ({ contactId, labelId })));
  }
  // Mantém o legacy contacts.labelId em sincronia (1º label, ou null se vazio)
  await db
    .update(contacts)
    .set({ labelId: uniq[0] ?? null })
    .where(eq(contacts.id, contactId));
}

export async function getContactsWithoutLabel(
  instanceIds: number[],
  since: Date
): Promise<{ id: number; instanceId: number }[]> {
  const db = await getDb();
  if (!db || instanceIds.length === 0) return [];

  return db
    .select({ id: contacts.id, instanceId: contacts.instanceId })
    .from(contacts)
    .where(
      and(
        inArray(contacts.instanceId, instanceIds),
        gte(contacts.createdAt, since),
        notExists(
          db
            .select({ x: contactLabels.contactId })
            .from(contactLabels)
            .where(eq(contactLabels.contactId, contacts.id))
        )
      )
    )
    .orderBy(asc(contacts.createdAt));
}

export async function getInboundMessageCount(contactId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.contactId, contactId),
        eq(messages.direction, "in")
      )
    );
  return Number(row?.count ?? 0);
}

// ─── Operation Center ────────────────────────────────────────────────────────

export interface OperationKPIs {
  tmaMinutes: number | null;      // Tempo Médio de Atendimento (duração da conversa)
  tmeMinutes: number | null;      // Tempo Médio de Espera (1ª resposta)
  slaPercent: number;             // % atendidos em ≤5min
  totalAtendimentos: number;      // contatos com ≥1 interação no período
  totalMessagesIn: number;
  totalMessagesOut: number;
  conversasAbertas: number;       // último msg=in sem out depois
  conversasResolvidas: number;    // último msg=out
  conversasInativas: number;      // sem msg há mais de 24h
}

export interface QueueItem {
  contactId: number;
  contactName: string | null;
  contactUid: string;
  instanceId: number;
  instanceAlias: string | null;
  lastMessageAt: Date;
  lastMessageText: string;
  waitMinutes: number;
  inboundCount: number;
}

export interface OperatorPerformance {
  instanceId: number;
  alias: string;
  uid: string;
  status: string;
  uniqueContacts: number;
  messagesIn: number;
  messagesOut: number;
  responseRate: number;          // % de contatos que receberam resposta
  avgResponseMin: number | null; // TME da operadora
  avgConversationMin: number | null; // TMA
  resolvedConversations: number;
}

export interface MessageTypeDistribution {
  type: string;
  count: number;
  pct: number;
}

export async function getOperationOverview(
  userId: number,
  opts?: { dateFrom?: Date; dateTo?: Date; visibleInstanceIds?: number[] }
): Promise<{
  kpis: OperationKPIs;
  queue: QueueItem[];
  operators: OperatorPerformance[];
  messageTypes: MessageTypeDistribution[];
  hourlyVolume: Array<{ hour: number; in: number; out: number }>;
  dowVolume: Array<{ dow: number; label: string; total: number }>;
}> {
  const empty = {
    kpis: { tmaMinutes: null, tmeMinutes: null, slaPercent: 0, totalAtendimentos: 0,
            totalMessagesIn: 0, totalMessagesOut: 0,
            conversasAbertas: 0, conversasResolvidas: 0, conversasInativas: 0 },
    queue: [], operators: [], messageTypes: [], hourlyVolume: [], dowVolume: [],
  };
  const db = await getDb();
  if (!db) return empty;

  const userInstsRaw = await db.select().from(instances).where(eq(instances.userId, userId));
  const userInsts = opts?.visibleInstanceIds
    ? userInstsRaw.filter((i) => opts.visibleInstanceIds!.includes(i.id))
    : userInstsRaw;
  const instIds = userInsts.map((i) => i.id);
  if (!instIds.length) return empty;

  const now = new Date();
  const periodStart = opts?.dateFrom ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date(opts?.dateTo ?? now);
  periodEnd.setHours(23, 59, 59, 999);

  const instIdsList = `ARRAY[${instIds.join(",")}]::int[]`;

  // ─── KPIs principais ─────────────────────────────────────────────────────
  // Buscamos os timestamps brutos por contato e calculamos TMA/TME/SLA em
  // JS aplicando businessMinutesBetween (seg-sex 08-17h BRT) — assim um lead
  // que chega 22h e responde 9h do dia seguinte não conta 11h, mas só 1h.
  const { businessMinutesBetween } = await import("./businessHours");

  const perContactRes = await db.execute(sql`
    WITH per_contact AS (
      SELECT
        c.id AS contact_id,
        MIN(CASE WHEN m.direction = 'in' THEN m."createdAt" END) AS first_in,
        MIN(CASE WHEN m.direction = 'out' THEN m."createdAt" END) AS first_out,
        MAX(m."createdAt") AS last_msg,
        MIN(m."createdAt") AS first_msg,
        COUNT(*) AS msg_count,
        MAX(CASE WHEN m."createdAt" = (SELECT MAX(m2."createdAt") FROM messages m2 WHERE m2."contactId" = c.id) THEN m.direction END) AS last_dir
      FROM contacts c
      INNER JOIN messages m ON m."contactId" = c.id
      WHERE c."instanceId" = ANY(${sql.raw(instIdsList)})
        AND m."createdAt" >= ${periodStart} AND m."createdAt" <= ${periodEnd}
      GROUP BY c.id
    )
    SELECT
      contact_id,
      first_in, first_out, last_msg, first_msg, msg_count, last_dir,
      last_msg < NOW() - INTERVAL '24 hours' AS is_inactive
    FROM per_contact
  `);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perContactRows = ((perContactRes as unknown as { rows: any[] }).rows ?? []);

  let tmaSum = 0, tmaCount = 0;
  let tmeSum = 0, tmeCount = 0;
  let within5Min = 0, attendedCount = 0;
  let conversasAbertas = 0, conversasResolvidas = 0, conversasInativas = 0;
  for (const row of perContactRows) {
    if (row.first_in && row.first_out && new Date(row.first_out).getTime() >= new Date(row.first_in).getTime()) {
      const tme = businessMinutesBetween(row.first_in, row.first_out);
      tmeSum += tme;
      tmeCount += 1;
      if (tme <= 5) within5Min += 1;
      attendedCount += 1;
    }
    if (Number(row.msg_count) > 1 && row.first_msg && row.last_msg) {
      const tma = businessMinutesBetween(row.first_msg, row.last_msg);
      tmaSum += tma;
      tmaCount += 1;
    }
    if (row.last_dir === "in") conversasAbertas += 1;
    else if (row.last_dir === "out") conversasResolvidas += 1;
    if (row.is_inactive) conversasInativas += 1;
  }
  const totalAtend = perContactRows.length;
  const kpiRow = {
    tma_minutes: tmaCount > 0 ? tmaSum / tmaCount : null,
    tme_minutes: tmeCount > 0 ? tmeSum / tmeCount : null,
    within_5min: within5Min,
    attended_count: attendedCount,
    total_atendimentos: totalAtend,
    conversas_abertas: conversasAbertas,
    conversas_resolvidas: conversasResolvidas,
    conversas_inativas: conversasInativas,
  };

  // Total messages in/out
  const [msgInRow] = await db.select({ count: sql<number>`COUNT(*)::int` })
    .from(messages)
    .where(and(inArray(messages.instanceId, instIds), eq(messages.direction, "in"),
               gte(messages.createdAt, periodStart), lte(messages.createdAt, periodEnd)));
  const [msgOutRow] = await db.select({ count: sql<number>`COUNT(*)::int` })
    .from(messages)
    .where(and(inArray(messages.instanceId, instIds), eq(messages.direction, "out"),
               gte(messages.createdAt, periodStart), lte(messages.createdAt, periodEnd)));

  const attendedCnt = Number(kpiRow.attended_count ?? 0);
  const within5 = Number(kpiRow.within_5min ?? 0);
  const totalAtendKpi = Number(kpiRow.total_atendimentos ?? 0);

  const kpis: OperationKPIs = {
    tmaMinutes: kpiRow.tma_minutes != null ? Math.round(Number(kpiRow.tma_minutes) * 10) / 10 : null,
    tmeMinutes: kpiRow.tme_minutes != null ? Math.round(Number(kpiRow.tme_minutes) * 10) / 10 : null,
    slaPercent: attendedCnt > 0 ? Math.round((within5 / attendedCnt) * 100) : 0,
    totalAtendimentos: totalAtendKpi,
    totalMessagesIn: Number(msgInRow?.count ?? 0),
    totalMessagesOut: Number(msgOutRow?.count ?? 0),
    conversasAbertas: Number(kpiRow.conversas_abertas ?? 0),
    conversasResolvidas: Number(kpiRow.conversas_resolvidas ?? 0),
    conversasInativas: Number(kpiRow.conversas_inativas ?? 0),
  };

  // ─── Fila de Espera ─────────────────────────────────────────────────────
  // Contatos cujo último msg é INBOUND (não respondido ainda)
  const queueRes = await db.execute(sql`
    WITH last_msg_per_contact AS (
      SELECT DISTINCT ON (m."contactId")
        m."contactId",
        m."createdAt" AS msg_at,
        m.direction,
        m.body,
        m.type
      FROM messages m
      WHERE m."instanceId" = ANY(${sql.raw(instIdsList)})
        AND m."createdAt" > NOW() - INTERVAL '7 days'
      ORDER BY m."contactId", m."createdAt" DESC
    )
    SELECT
      c.id AS contact_id,
      c.name AS contact_name,
      c.uid AS contact_uid,
      i.id AS instance_id,
      i.alias AS instance_alias,
      lm.msg_at AS last_message_at,
      lm.body AS last_body,
      lm.type AS last_type,
      EXTRACT(EPOCH FROM (NOW() - lm.msg_at)) / 60.0 AS wait_min,
      (SELECT COUNT(*) FROM messages m2 WHERE m2."contactId" = c.id AND m2.direction = 'in') AS inbound_count
    FROM contacts c
    INNER JOIN last_msg_per_contact lm ON lm."contactId" = c.id
    INNER JOIN instances i ON i.id = c."instanceId"
    WHERE lm.direction = 'in'
      AND i."userId" = ${userId}
    ORDER BY wait_min DESC
    LIMIT 50
  `);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queueRows = ((queueRes as unknown as { rows: any[] }).rows ?? []);
  const nowMs = new Date();
  const queue: QueueItem[] = queueRows
    .map((r) => {
      let text = "";
      try {
        const body = typeof r.last_body === "string" ? JSON.parse(r.last_body) : r.last_body;
        text = body?.text ?? body?.caption ?? `[${r.last_type ?? "msg"}]`;
      } catch {
        text = "[mensagem]";
      }
      // Tempo de espera em minutos COMERCIAIS (seg-sex 08-17h BRT)
      const waitMinutes = businessMinutesBetween(r.last_message_at, nowMs);
      return {
        contactId: Number(r.contact_id),
        contactName: r.contact_name,
        contactUid: r.contact_uid,
        instanceId: Number(r.instance_id),
        instanceAlias: r.instance_alias,
        lastMessageAt: new Date(r.last_message_at),
        lastMessageText: String(text).slice(0, 200),
        waitMinutes: Math.round(waitMinutes * 10) / 10,
        inboundCount: Number(r.inbound_count ?? 0),
      };
    })
    .sort((a, b) => b.waitMinutes - a.waitMinutes);

  // ─── Performance por Operadora (instância) ─────────────────────────────
  const opsRes = await db.execute(sql`
    WITH msg_stats AS (
      SELECT
        m."instanceId",
        COUNT(DISTINCT m."contactId") AS unique_contacts,
        COUNT(*) FILTER (WHERE m.direction = 'in') AS msgs_in,
        COUNT(*) FILTER (WHERE m.direction = 'out') AS msgs_out
      FROM messages m
      WHERE m."instanceId" = ANY(${sql.raw(instIdsList)})
        AND m."createdAt" >= ${periodStart} AND m."createdAt" <= ${periodEnd}
      GROUP BY m."instanceId"
    ),
    contact_stats AS (
      SELECT
        c."instanceId",
        c.id AS contact_id,
        MIN(CASE WHEN m.direction = 'in' THEN m."createdAt" END) AS first_in,
        MIN(CASE WHEN m.direction = 'out' THEN m."createdAt" END) AS first_out,
        MAX(m."createdAt") AS last_msg,
        MIN(m."createdAt") AS first_msg,
        MAX(CASE WHEN m."createdAt" = (SELECT MAX(m2."createdAt") FROM messages m2 WHERE m2."contactId" = c.id AND m2."createdAt" >= ${periodStart} AND m2."createdAt" <= ${periodEnd}) THEN m.direction END) AS last_dir,
        COUNT(*) AS msg_count
      FROM contacts c
      INNER JOIN messages m ON m."contactId" = c.id
      WHERE c."instanceId" = ANY(${sql.raw(instIdsList)})
        AND m."createdAt" >= ${periodStart} AND m."createdAt" <= ${periodEnd}
      GROUP BY c."instanceId", c.id
    ),
    contact_agg AS (
      SELECT
        "instanceId",
        COUNT(*) AS total_contacts,
        COUNT(*) FILTER (WHERE first_out IS NOT NULL) AS responded,
        AVG(EXTRACT(EPOCH FROM (first_out - first_in)) / 60.0) FILTER (WHERE first_in IS NOT NULL AND first_out IS NOT NULL AND first_out >= first_in) AS avg_response_min,
        AVG(EXTRACT(EPOCH FROM (last_msg - first_msg)) / 60.0) FILTER (WHERE msg_count > 1) AS avg_conv_min,
        COUNT(*) FILTER (WHERE last_dir = 'out') AS resolved
      FROM contact_stats
      GROUP BY "instanceId"
    )
    SELECT
      i.id, i.alias, i.uid, i.status,
      COALESCE(ms.unique_contacts, 0) AS unique_contacts,
      COALESCE(ms.msgs_in, 0) AS msgs_in,
      COALESCE(ms.msgs_out, 0) AS msgs_out,
      COALESCE(ca.total_contacts, 0) AS total_contacts,
      COALESCE(ca.responded, 0) AS responded,
      ca.avg_response_min,
      ca.avg_conv_min,
      COALESCE(ca.resolved, 0) AS resolved
    FROM instances i
    LEFT JOIN msg_stats ms ON ms."instanceId" = i.id
    LEFT JOIN contact_agg ca ON ca."instanceId" = i.id
    WHERE i."userId" = ${userId}
    ORDER BY ms.unique_contacts DESC NULLS LAST
  `);
  const operators: OperatorPerformance[] = ((opsRes as unknown as { rows: any[] }).rows ?? []).map((r) => {
    const totalContacts = Number(r.total_contacts ?? 0);
    const responded = Number(r.responded ?? 0);
    return {
      instanceId: Number(r.id),
      alias: r.alias ?? r.uid,
      uid: r.uid,
      status: r.status ?? "unknown",
      uniqueContacts: Number(r.unique_contacts ?? 0),
      messagesIn: Number(r.msgs_in ?? 0),
      messagesOut: Number(r.msgs_out ?? 0),
      responseRate: totalContacts > 0 ? Math.round((responded / totalContacts) * 100) : 0,
      avgResponseMin: r.avg_response_min != null ? Math.round(Number(r.avg_response_min) * 10) / 10 : null,
      avgConversationMin: r.avg_conv_min != null ? Math.round(Number(r.avg_conv_min) * 10) / 10 : null,
      resolvedConversations: Number(r.resolved ?? 0),
    };
  });

  // ─── Distribuição por tipo de mensagem ────────────────────────────────
  const typesRes = await db.select({
    type: messages.type,
    count: sql<number>`COUNT(*)::int`,
  }).from(messages)
    .where(and(inArray(messages.instanceId, instIds),
               gte(messages.createdAt, periodStart), lte(messages.createdAt, periodEnd)))
    .groupBy(messages.type)
    .orderBy(desc(sql`COUNT(*)`));
  const totalTypes = typesRes.reduce((s, r) => s + Number(r.count), 0);
  const messageTypes: MessageTypeDistribution[] = typesRes.map((r) => ({
    type: r.type,
    count: Number(r.count),
    pct: totalTypes > 0 ? Math.round((Number(r.count) / totalTypes) * 100) : 0,
  }));

  // ─── Volume horário (in vs out) ────────────────────────────────────────
  const hourlyRes = await db.execute(sql`
    SELECT
      EXTRACT(hour FROM "createdAt")::int AS hour,
      COUNT(*) FILTER (WHERE direction = 'in') AS msg_in,
      COUNT(*) FILTER (WHERE direction = 'out') AS msg_out
    FROM messages
    WHERE "instanceId" = ANY(${sql.raw(instIdsList)})
      AND "createdAt" >= ${periodStart} AND "createdAt" <= ${periodEnd}
    GROUP BY hour
    ORDER BY hour
  `);
  const hourlyMap = new Map<number, { in: number; out: number }>();
  for (let h = 0; h < 24; h++) hourlyMap.set(h, { in: 0, out: 0 });
  ((hourlyRes as unknown as { rows: any[] }).rows ?? []).forEach((r) => {
    hourlyMap.set(Number(r.hour), { in: Number(r.msg_in ?? 0), out: Number(r.msg_out ?? 0) });
  });
  const hourlyVolume = Array.from(hourlyMap.entries()).map(([hour, v]) => ({ hour, in: v.in, out: v.out }));

  // ─── Volume por dia da semana ──────────────────────────────────────────
  const dowRes = await db.execute(sql`
    SELECT EXTRACT(dow FROM "createdAt")::int AS dow, COUNT(*) AS total
    FROM messages
    WHERE "instanceId" = ANY(${sql.raw(instIdsList)})
      AND "createdAt" >= ${periodStart} AND "createdAt" <= ${periodEnd}
    GROUP BY dow
    ORDER BY dow
  `);
  const dowLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dowMap = new Map<number, number>();
  for (let d = 0; d < 7; d++) dowMap.set(d, 0);
  ((dowRes as unknown as { rows: any[] }).rows ?? []).forEach((r) => {
    dowMap.set(Number(r.dow), Number(r.total ?? 0));
  });
  const dowVolume = Array.from(dowMap.entries()).map(([dow, total]) => ({ dow, label: dowLabels[dow] ?? "?", total }));

  return { kpis, queue, operators, messageTypes, hourlyVolume, dowVolume };
}
