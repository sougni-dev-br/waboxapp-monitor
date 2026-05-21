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
  await db.delete(labelRules).where(and(eq(labelRules.labelId, id), eq(labelRules.userId, userId)));
  await db.delete(labels).where(and(eq(labels.id, id), eq(labels.userId, userId)));
  await db.update(contacts).set({ labelId: null }).where(eq(contacts.labelId, id));
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
  totalMessages: number;
  messagesLast24h: number;
  instancesOnline: number;
  instancesOffline: number;
  instancesTotal: number;
  dailySeries: Array<{ date: string; newContacts: number; messages: number }>;
  labelDistribution: Array<{ labelId: number; labelName: string; labelColor: string; count: number }>;
  topInstances: Array<{ instanceId: number; alias: string; uid: string; contactCount: number; messageCount: number; status: string }>;
  hourlyHeatmap: Array<{ hour: number; count: number }>;
  instanceUptime: Array<{ instanceId: number; alias: string; uptimePercent: number; totalChecks: number; onlineChecks: number }>;
  avgResponseTimeMinutes: number | null;
}

export async function getDashboardOverview(
  userId: number,
  opts?: { dateFrom?: Date; dateTo?: Date }
): Promise<DashboardOverview> {
  const db = await getDb();
  const emptyResult: DashboardOverview = {
    totalContacts: 0, newContactsToday: 0, newContactsYesterday: 0,
    newContactsThisWeek: 0, newContactsThisMonth: 0, totalMessages: 0,
    messagesLast24h: 0, instancesOnline: 0, instancesOffline: 0, instancesTotal: 0,
    dailySeries: [], labelDistribution: [], topInstances: [], hourlyHeatmap: [],
    instanceUptime: [], avgResponseTimeMinutes: null,
  };
  if (!db) return emptyResult;

  const userInstances = await db.select().from(instances).where(eq(instances.userId, userId));
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
    totalMessages: Number(totalMsgRow?.count ?? 0),
    messagesLast24h: Number(msg24hRow?.count ?? 0),
    instancesOnline: userInstances.filter((i) => i.status === 'online').length,
    instancesOffline: userInstances.filter((i) => i.status === 'offline').length,
    instancesTotal: userInstances.length,
    dailySeries,
    labelDistribution: labelDist.map((r) => ({ ...r, count: Number(r.count) })),
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

export async function getRealtimePulse(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const userInstances = await db.select().from(instances).where(eq(instances.userId, userId));
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
  let lastMsgInstanceAlias: string | null = null;
  if (lastMsgRow) {
    const [contactRow] = await db.select({ name: contacts.name, uid: contacts.uid }).from(contacts)
      .where(eq(contacts.id, lastMsgRow.contactId)).limit(1);
    lastMsgContactName = contactRow?.name ?? contactRow?.uid ?? null;
    const inst = userInstances.find((i) => i.id === lastMsgRow.instanceId);
    lastMsgInstanceAlias = inst?.alias ?? inst?.uid ?? null;
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
  let topContactMsgCount = 0;
  if (topContactRow) {
    const [cRow] = await db.select({ name: contacts.name, uid: contacts.uid }).from(contacts)
      .where(eq(contacts.id, topContactRow.contactId)).limit(1);
    topContactName = cRow?.name ?? cRow?.uid ?? null;
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
      contactName: contact?.name ?? contact?.uid ?? 'Desconhecido',
      instanceAlias: inst?.alias ?? inst?.uid ?? '?',
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
      contactName: lastMsgContactName,
      instanceAlias: lastMsgInstanceAlias,
    } : null,
    topContact: topContactName ? { name: topContactName, msgCount: topContactMsgCount } : null,
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
