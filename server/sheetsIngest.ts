/**
 * server/sheetsIngest.ts — leitura/parse de planilhas Google publicadas como CSV.
 *
 * O backend não tem acesso autenticado à API do Google — usamos a versão
 * "Publicar na web → CSV". A URL fica em env var:
 *   SHEETS_CUSTOS_CSV_URL=https://docs.google.com/spreadsheets/d/e/.../pub?gid=...&single=true&output=csv
 *
 * Para forçar a leitura mais recente (ignorando o cache de 5min do publish),
 * o Google oferece um query `?cachebust=<random>` mas na prática usamos
 * cache local de 60s para reduzir o número de fetches.
 */

export interface CustoRow {
  /** Date in YYYY-MM-DD (parsed from BR or ISO formats). */
  date: string;
  channel: string;
  campaign: string;
  hospital: string;
  cost: number;
  note: string;
}

interface CachedFetch {
  fetchedAt: number;
  rows: CustoRow[];
}

const CACHE_TTL_MS = 60_000;
let cache: { url: string; payload: CachedFetch } | null = null;

/** Tenta vários formatos comuns de data. Retorna YYYY-MM-DD ou null. */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // ISO YYYY-MM-DD ou YYYY/MM/DD
  let m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const y = m[1]; const mo = m[2].padStart(2, "0"); const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  // BR DD/MM/YYYY ou DD-MM-YYYY
  m = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    const d = m[1].padStart(2, "0"); const mo = m[2].padStart(2, "0"); const y = m[3];
    return `${y}-${mo}-${d}`;
  }
  return null;
}

/** Parse de valor BR "R$ 1.234,56" ou US "1234.56" -> number. */
function parseMoney(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/R\$/gi, "").trim();
  if (!cleaned) return 0;
  // Heurística: se contém vírgula, BR (ponto = milhar)
  if (cleaned.includes(",")) {
    const norm = cleaned.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(norm);
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Parser de CSV simples — suporta campos com vírgula entre aspas. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { buf += '"'; i++; }
        else inQ = false;
      } else {
        buf += c;
      }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ",") { cur.push(buf); buf = ""; }
      else if (c === "\n") { cur.push(buf); rows.push(cur); cur = []; buf = ""; }
      else if (c === "\r") { /* skip */ }
      else { buf += c; }
    }
  }
  if (buf.length || cur.length) { cur.push(buf); rows.push(cur); }
  return rows;
}

/** Detecta a coluna pelo nome (case/accents-insensitive). */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Lê e parseia o CSV das CUSTOS da planilha publicada. */
export async function fetchCustos(): Promise<CustoRow[] | null> {
  const url = process.env.SHEETS_CUSTOS_CSV_URL;
  if (!url) {
    return null;
  }
  if (cache && cache.url === url && Date.now() - cache.payload.fetchedAt < CACHE_TTL_MS) {
    return cache.payload.rows;
  }
  try {
    const res = await fetch(url, { headers: { Accept: "text/csv,text/plain" } });
    if (!res.ok) {
      console.warn(`[sheetsIngest] fetch CUSTOS falhou: HTTP ${res.status}`);
      return cache?.payload.rows ?? null;
    }
    const text = await res.text();
    const matrix = parseCSV(text).filter((r) => r.some((c) => c.trim().length > 0));
    if (matrix.length === 0) return [];

    const header = matrix[0].map(normalizeHeader);
    const idx = {
      date: header.findIndex((h) => h === "data" || h === "date" || h.startsWith("data")),
      channel: header.findIndex((h) => h === "canal" || h === "channel"),
      campaign: header.findIndex((h) => h === "campanha" || h === "campaign"),
      hospital: header.findIndex((h) => h === "hospital"),
      cost: header.findIndex((h) => h === "custo" || h === "custors" || h.startsWith("custo")),
      note: header.findIndex((h) => h.startsWith("obs") || h === "note" || h === "observacao"),
    };

    if (idx.date < 0 || idx.cost < 0) {
      console.warn("[sheetsIngest] colunas obrigatórias DATA/CUSTO não encontradas no CSV");
      return [];
    }

    const rows: CustoRow[] = [];
    for (let i = 1; i < matrix.length; i++) {
      const r = matrix[i];
      const date = parseDate(r[idx.date] ?? "");
      if (!date) continue;
      const cost = parseMoney(r[idx.cost] ?? "");
      if (cost === 0 && !r[idx.note]) continue; // ignora linhas vazias
      rows.push({
        date,
        channel: (r[idx.channel] ?? "").trim() || "—",
        campaign: (r[idx.campaign] ?? "").trim() || "—",
        hospital: (r[idx.hospital] ?? "").trim() || "—",
        cost,
        note: (r[idx.note] ?? "").trim(),
      });
    }
    cache = { url, payload: { fetchedAt: Date.now(), rows } };
    return rows;
  } catch (err) {
    console.error("[sheetsIngest] erro ao buscar CUSTOS:", err);
    return cache?.payload.rows ?? null;
  }
}

// ─── Aggregations ────────────────────────────────────────────────────────────

interface AggBucket {
  key: string;
  total: number;
  rows: number;
}

function aggBy(rows: CustoRow[], pick: (r: CustoRow) => string): AggBucket[] {
  const map = new Map<string, AggBucket>();
  for (const r of rows) {
    const k = pick(r);
    const ex = map.get(k);
    if (ex) { ex.total += r.cost; ex.rows += 1; }
    else { map.set(k, { key: k, total: r.cost, rows: 1 }); }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function inRange(d: string, from?: string, to?: string): boolean {
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export interface InvestmentSummary {
  total: number;
  lines: number;
  source: "sheet" | "unavailable";
  range: { from: string | null; to: string | null };
  byChannel: AggBucket[];
  byCampaign: AggBucket[];
  byHospital: AggBucket[];
  /** série diária ordenada cronologicamente */
  daily: { date: string; cost: number }[];
}

export async function getInvestmentSummary(opts: { dateFrom?: string; dateTo?: string } = {}): Promise<InvestmentSummary> {
  const rows = await fetchCustos();
  if (rows === null) {
    return {
      total: 0,
      lines: 0,
      source: "unavailable",
      range: { from: opts.dateFrom ?? null, to: opts.dateTo ?? null },
      byChannel: [],
      byCampaign: [],
      byHospital: [],
      daily: [],
    };
  }
  const scoped = rows.filter((r) => inRange(r.date, opts.dateFrom, opts.dateTo));
  const total = scoped.reduce((acc, r) => acc + r.cost, 0);
  const dailyMap = new Map<string, number>();
  for (const r of scoped) dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + r.cost);
  const daily = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, cost]) => ({ date, cost }));
  return {
    total,
    lines: scoped.length,
    source: "sheet",
    range: { from: opts.dateFrom ?? null, to: opts.dateTo ?? null },
    byChannel: aggBy(scoped, (r) => r.channel),
    byCampaign: aggBy(scoped, (r) => r.campaign),
    byHospital: aggBy(scoped, (r) => r.hospital),
    daily,
  };
}
