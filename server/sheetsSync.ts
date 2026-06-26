/**
 * server/sheetsSync.ts — ETL periódico Google Sheets → Postgres.
 *
 * Lê as planilhas (NUCLEO / CUSTOS / PIPELINE) reaproveitando os fetchers já
 * existentes em mediaInvestment.ts e sheetsIngest.ts, e faz upsert nas tabelas
 * espelho (sheets_media_rows / sheets_custos_rows / sheets_pipeline_leads).
 * O dashboard passa a ler do banco; a leitura direta vira fallback.
 *
 * Cada execução registra uma linha em sheets_sync_log (running → success/error).
 */
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  sheetsMediaRows,
  sheetsCustosRows,
  sheetsPipelineLeads,
  sheetsSyncLog,
} from "../drizzle/schema";
import { fetchAllSheets } from "./mediaInvestment";
import { fetchCustos, fetchPipelineLeads } from "./sheetsIngest";

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const UPSERT_CHUNK = 500;

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Dedup por chave composta — evita "ON CONFLICT ... affect row a second time". */
function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(key(r), r); // mantém o último
  return Array.from(map.values());
}

// ─── Log helpers ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logStart(db: any, source: string): Promise<number | null> {
  try {
    const r = await db
      .insert(sheetsSyncLog)
      .values({ source, status: "running" })
      .returning({ id: sheetsSyncLog.id });
    return r[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function logFinish(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  id: number | null,
  status: "success" | "error",
  rowsUpserted: number,
  errorMessage?: string,
): Promise<void> {
  if (id == null) return;
  try {
    await db
      .update(sheetsSyncLog)
      .set({ status, rowsUpserted, errorMessage: errorMessage ?? null, finishedAt: new Date() })
      .where(eq(sheetsSyncLog.id, id));
  } catch (err) {
    console.error("[SheetsSync] falha ao gravar sync_log:", err);
  }
}

// ─── Syncs por fonte ──────────────────────────────────────────────────────────

export async function syncMediaRows(): Promise<{ source: string; rows: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const logId = await logStart(db, "media");
  try {
    const media = await fetchAllSheets();
    const values = dedupeBy(
      media.map((r) => ({
        date: toISO(r.date),
        hospital: r.hospital,
        procedure: r.procedure,
        channel: r.channel || "GOOGLE",
        impressions: Math.round(Number.isFinite(r.impressions) ? r.impressions : 0),
        clicks: Math.round(Number.isFinite(r.clicks) ? r.clicks : 0),
        ctr: Number.isFinite(r.ctr) ? String(r.ctr) : "0",
        cost: Number.isFinite(r.cost) ? String(r.cost) : "0",
        cpc: Number.isFinite(r.cpc) ? String(r.cpc) : "0",
      })),
      (v) => `${v.date}|${v.hospital}|${v.procedure}|${v.channel}`,
    );

    let upserted = 0;
    for (const batch of chunk(values, UPSERT_CHUNK)) {
      await db
        .insert(sheetsMediaRows)
        .values(batch)
        .onConflictDoUpdate({
          target: [sheetsMediaRows.date, sheetsMediaRows.hospital, sheetsMediaRows.procedure, sheetsMediaRows.channel],
          set: {
            impressions: sql`excluded."impressions"`,
            clicks: sql`excluded."clicks"`,
            ctr: sql`excluded."ctr"`,
            cost: sql`excluded."cost"`,
            cpc: sql`excluded."cpc"`,
            syncedAt: sql`now()`,
          },
        });
      upserted += batch.length;
    }
    await logFinish(db, logId, "success", upserted);
    return { source: "media", rows: upserted };
  } catch (err) {
    await logFinish(db, logId, "error", 0, String(err));
    throw err;
  }
}

export async function syncCustosRows(): Promise<{ source: string; rows: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const logId = await logStart(db, "custos");
  try {
    const custos = (await fetchCustos()) ?? [];
    const values = dedupeBy(
      custos.map((r) => ({
        date: r.date,
        channel: r.channel || "—",
        campaign: r.campaign || "—",
        hospital: r.hospital || "—",
        cost: Number.isFinite(r.cost) ? String(r.cost) : "0",
        note: r.note || "",
      })),
      (v) => `${v.date}|${v.hospital}|${v.channel}|${v.campaign}`,
    );

    let upserted = 0;
    for (const batch of chunk(values, UPSERT_CHUNK)) {
      await db
        .insert(sheetsCustosRows)
        .values(batch)
        .onConflictDoUpdate({
          target: [sheetsCustosRows.date, sheetsCustosRows.hospital, sheetsCustosRows.channel, sheetsCustosRows.campaign],
          set: {
            cost: sql`excluded."cost"`,
            note: sql`excluded."note"`,
            syncedAt: sql`now()`,
          },
        });
      upserted += batch.length;
    }
    await logFinish(db, logId, "success", upserted);
    return { source: "custos", rows: upserted };
  } catch (err) {
    await logFinish(db, logId, "error", 0, String(err));
    throw err;
  }
}

export async function syncPipelineLeads(): Promise<{ source: string; rows: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const logId = await logStart(db, "pipeline");
  try {
    const leads = (await fetchPipelineLeads()) ?? [];
    const values = dedupeBy(
      leads.map((l) => ({
        dateEntered: l.dateEntered,
        phone: l.phone,
        name: l.name || "",
        hospital: l.hospital || "—",
        procedure: l.procedure || "—",
        channel: l.channel || "—",
        campaign: l.campaign || "—",
        dateScheduled: l.dateScheduled,
        dateConsultation: l.dateConsultation,
        dateSurgery: l.dateSurgery,
        surgeryValue: Number.isFinite(l.surgeryValue) ? String(l.surgeryValue) : "0",
        lossReason: l.lossReason || "",
        status: l.status,
      })),
      (v) => `${v.dateEntered}|${v.phone}`,
    );

    let upserted = 0;
    for (const batch of chunk(values, UPSERT_CHUNK)) {
      await db
        .insert(sheetsPipelineLeads)
        .values(batch)
        .onConflictDoUpdate({
          target: [sheetsPipelineLeads.dateEntered, sheetsPipelineLeads.phone],
          set: {
            name: sql`excluded."name"`,
            hospital: sql`excluded."hospital"`,
            procedure: sql`excluded."procedure"`,
            channel: sql`excluded."channel"`,
            campaign: sql`excluded."campaign"`,
            dateScheduled: sql`excluded."dateScheduled"`,
            dateConsultation: sql`excluded."dateConsultation"`,
            dateSurgery: sql`excluded."dateSurgery"`,
            surgeryValue: sql`excluded."surgeryValue"`,
            lossReason: sql`excluded."lossReason"`,
            status: sql`excluded."status"`,
            syncedAt: sql`now()`,
          },
        });
      upserted += batch.length;
    }
    await logFinish(db, logId, "success", upserted);
    return { source: "pipeline", rows: upserted };
  } catch (err) {
    await logFinish(db, logId, "error", 0, String(err));
    throw err;
  }
}

export interface SyncResult {
  source: string;
  status: "success" | "error";
  rows?: number;
  error?: string;
}

/** Roda as 3 syncs em paralelo; falha individual não aborta as outras. */
export async function syncAllSheets(): Promise<SyncResult[]> {
  const tasks: Array<[string, Promise<{ source: string; rows: number }>]> = [
    ["media", syncMediaRows()],
    ["custos", syncCustosRows()],
    ["pipeline", syncPipelineLeads()],
  ];
  const settled = await Promise.allSettled(tasks.map(([, p]) => p));
  const results: SyncResult[] = settled.map((s, i) => {
    const source = tasks[i][0];
    if (s.status === "fulfilled") {
      return { source, status: "success", rows: s.value.rows };
    }
    console.error(`[SheetsSync] '${source}' falhou:`, s.reason);
    return { source, status: "error", error: String(s.reason) };
  });
  return results;
}

let _interval: ReturnType<typeof setInterval> | null = null;

/** Warm-up imediato no boot + ciclo a cada `intervalMs` (default 10 min). */
export function startSheetsSync(intervalMs: number = SYNC_INTERVAL_MS): void {
  const runCycle = async () => {
    const startedAt = Date.now();
    console.log("[SheetsSync] ciclo iniciado");
    try {
      const results = await syncAllSheets();
      const summary = results
        .map((r) => `${r.source}=${r.status === "success" ? `${r.rows} linhas` : "ERRO"}`)
        .join(" · ");
      console.log(`[SheetsSync] ciclo concluído em ${Date.now() - startedAt}ms — ${summary}`);
    } catch (err) {
      console.error("[SheetsSync] ciclo falhou:", err);
    }
  };

  // Warm-up sem bloquear o boot.
  void runCycle();

  if (_interval) clearInterval(_interval);
  _interval = setInterval(() => void runCycle(), intervalMs);
}
