/**
 * Mídia Investment — agregador de dados das 9 abas da planilha de telemetria
 * de mídia paga (Google Ads) por hospital + procedimento.
 *
 * A planilha foi publicada como CSV ("Arquivo → Compartilhar → Publicar na web")
 * e cada aba é puxada via endpoint pub?gid=N&output=csv. Sem auth necessária.
 *
 * Cache em memória de 10 min para não bater no Google a cada request do dashboard.
 */
import { hospitalOf } from "./hospitalUtils";

const PUB_ID =
  "2PACX-1vR62jBrdVB1lmgM3JvzhoHOND5ehKgw2RwMOUrcL5Vg4yecuBdrls31xhJoOXynfNl3uHswkbczY569";

export interface MediaRow {
  date: Date;        // parsed from "dd/MM/yyyy"
  impressions: number;
  clicks: number;
  ctr: number;       // 0..1 (already divided)
  cost: number;      // BRL
  cpc: number;       // BRL (NaN quando #DIV/0!)
  procedure: string; // CATARATA | REFRATIVA | PLASTICA
  hospital: string;  // HOLHOS | HOPE | CBV | SANTA LUZIA
  channel: string;   // GOOGLE
}

// Mapeamento ordem das abas → gid (descoberto via pubhtml)
const SHEETS = [
  { gid: "0",          name: "H.OLHOS - CATARATA" },
  { gid: "1216857079", name: "H.OLHOS - REFRATIVA" },
  { gid: "300713107",  name: "HOPE - CATARATA" },
  { gid: "1146549553", name: "HOPE - REFRATIVA" },
  { gid: "357997225",  name: "CBV - CATARATA" },
  { gid: "1159198861", name: "CBV - REFRATIVA" },
  { gid: "1195793296", name: "CBV - PLASTICA" },
  { gid: "1982045300", name: "SANTA LUZIA - CATARATA" },
  { gid: "1580969915", name: "SANTA LUZIA - REFRATIVA" },
];

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const FETCH_TIMEOUT_MS = 8_000;
let _cache: { rows: MediaRow[]; ts: number } | null = null;
let _inflight: Promise<MediaRow[]> | null = null;

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseBRDate(s: string): Date | null {
  // "01/05/2026" → Date(2026, 4, 1)
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function parseBRNumber(s: string | undefined): number {
  // "1.996" → 1996; "1.807,72" → 1807.72; "" → 0; "#DIV/0!" → NaN
  if (!s) return 0;
  const t = s.trim();
  if (!t || t.startsWith("#")) return NaN;
  // Remove R$ e espaços
  const clean = t.replace(/R\$\s*/g, "").replace(/\s/g, "");
  // BR usa . como milhar e , como decimal → trocar . por "" e , por .
  const normalized = clean.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return isNaN(n) ? NaN : n;
}

function parseBRPercent(s: string | undefined): number {
  // "9,92%" → 0.0992; vazio → 0
  if (!s) return 0;
  const t = s.trim().replace(/%/g, "");
  if (!t || t.startsWith("#")) return NaN;
  const n = parseBRNumber(t);
  return isNaN(n) ? NaN : n / 100;
}

// CSV parser leve que respeita aspas (Google retorna fields com vírgula entre aspas)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

async function fetchSheet(gid: string): Promise<MediaRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?gid=${gid}&single=true&output=csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let csv: string;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[mediaInvestment] fetch gid=${gid} returned ${res.status}`);
      return [];
    }
    csv = await res.text();
  } catch (err) {
    // Inclui AbortError (timeout de 8s) — propaga pra getMediaRows cair no
    // cache stale (_cache?.rows) via o catch de fetchAllSheets/getMediaRows.
    console.error(`[mediaInvestment] erro/timeout fetch gid=${gid}:`, err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  // Header esperado: DATA, IMPRESSOES, CLIQUES, CTR, CUSTO, CPC, PROCEDIMENTO, HOSPITAL, CANAL
  const parsed: MediaRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseBRDate(r[0] ?? "");
    if (!date) continue; // skip empty/invalid rows
    const hospital = (r[7] ?? "").trim();
    const procedure = (r[6] ?? "").trim();
    if (!hospital || !procedure) continue;
    parsed.push({
      date,
      impressions: parseBRNumber(r[1]) || 0,
      clicks: parseBRNumber(r[2]) || 0,
      ctr: parseBRPercent(r[3]),
      cost: parseBRNumber(r[4]) || 0,
      cpc: parseBRNumber(r[5]),
      procedure,
      hospital,
      channel: (r[8] ?? "GOOGLE").trim(),
    });
  }
  return parsed;
}

// Exportado para o ETL (server/sheetsSync.ts) — busca fresca das 9 abas,
// sem passar pelo cache de getMediaRows.
export async function fetchAllSheets(): Promise<MediaRow[]> {
  // Paralelo: 9 fetches simultâneos
  const results = await Promise.all(SHEETS.map((s) => fetchSheet(s.gid)));
  return results.flat();
}

export async function getMediaRows(): Promise<MediaRow[]> {
  const now = Date.now();
  if (_cache && now - _cache.ts < CACHE_TTL_MS) return _cache.rows;
  if (_inflight) return _inflight;
  _inflight = fetchAllSheets().then((rows) => {
    _cache = { rows, ts: now };
    _inflight = null;
    return rows;
  }).catch((err) => {
    _inflight = null;
    console.error("[mediaInvestment] fetch failed", err);
    return _cache?.rows ?? [];
  });
  return _inflight;
}

// ─── Aggregations ─────────────────────────────────────────────────────────────

export interface MediaFilter {
  dateFrom?: Date;
  dateTo?: Date;
  hospitals?: string[];   // se vazio/undefined → todos
  procedures?: string[];  // se vazio/undefined → todos
}

function matchesFilter(row: MediaRow, f: MediaFilter): boolean {
  if (f.dateFrom && row.date < f.dateFrom) return false;
  if (f.dateTo && row.date > f.dateTo) return false;
  if (f.hospitals?.length && !f.hospitals.includes(row.hospital)) return false;
  if (f.procedures?.length && !f.procedures.includes(row.procedure)) return false;
  return true;
}

export interface MediaInvestmentSummary {
  totalCost: number;
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number;       // 0..1
  avgCpc: number;       // BRL
  byHospital: Array<{ hospital: string; cost: number; color: string }>;
  byProcedure: Array<{ procedure: string; cost: number; color: string }>;
  availableHospitals: string[];   // todos os hospitais distintos no dataset
  availableProcedures: string[];  // todos os procedimentos distintos no dataset
}

// Paleta consistente (mesma ordem alfabética = mesma cor sempre)
const HOSPITAL_COLORS: Record<string, string> = {
  "HOLHOS":      "#DFFF00", // lime sougni
  "HOPE":        "#3B82F6", // blue
  "CBV":         "#10B981", // emerald
  "SANTA LUZIA": "#F59E0B", // amber
};
const PROCEDURE_COLORS: Record<string, string> = {
  "CATARATA":  "#DFFF00", // lime sougni
  "REFRATIVA": "#8B5CF6", // violet
  "PLASTICA":  "#EC4899", // pink
};
const FALLBACK_COLORS = ["#06B6D4", "#F97316", "#84CC16", "#14B8A6", "#A855F7", "#6366F1"];

function pickColor(map: Record<string, string>, key: string, fallbackIdx: number): string {
  return map[key] ?? FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
}

export async function getMediaInvestmentSummary(
  filter: MediaFilter,
): Promise<MediaInvestmentSummary> {
  const allRows = await getMediaRows();
  return summarizeMediaRows(allRows, filter);
}

/**
 * Agregação pura sobre um conjunto de MediaRow já carregado. Reutilizada tanto
 * pela leitura direta da planilha (getMediaInvestmentSummary) quanto pela
 * leitura do banco (getMediaInvestmentFromDb), garantindo interface idêntica.
 */
export function summarizeMediaRows(
  allRows: MediaRow[],
  filter: MediaFilter,
): MediaInvestmentSummary {
  const availableHospitals = Array.from(new Set(allRows.map((r) => r.hospital))).sort();
  const availableProcedures = Array.from(new Set(allRows.map((r) => r.procedure))).sort();

  const rows = allRows.filter((r) => matchesFilter(r, filter));

  let totalCost = 0, totalImpressions = 0, totalClicks = 0;
  const hospitalMap = new Map<string, number>();
  const procedureMap = new Map<string, number>();

  for (const r of rows) {
    totalCost += r.cost;
    totalImpressions += r.impressions;
    totalClicks += r.clicks;
    hospitalMap.set(r.hospital, (hospitalMap.get(r.hospital) ?? 0) + r.cost);
    procedureMap.set(r.procedure, (procedureMap.get(r.procedure) ?? 0) + r.cost);
  }

  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgCpc = totalClicks > 0 ? totalCost / totalClicks : 0;

  const byHospital = Array.from(hospitalMap.entries())
    .filter(([, cost]) => cost > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([hospital, cost], i) => ({ hospital, cost, color: pickColor(HOSPITAL_COLORS, hospital, i) }));

  const byProcedure = Array.from(procedureMap.entries())
    .filter(([, cost]) => cost > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([procedure, cost], i) => ({ procedure, cost, color: pickColor(PROCEDURE_COLORS, procedure, i) }));

  return {
    totalCost,
    totalImpressions,
    totalClicks,
    avgCtr,
    avgCpc,
    byHospital,
    byProcedure,
    availableHospitals,
    availableProcedures,
  };
}

// ─── Instance ↔ Hospital/Procedure mapping ────────────────────────────────────
//
// As instâncias do WhatsApp não têm colunas hospital/procedimento no schema.
// Mapeamento manual por alias (heurística) — quando um filtro de hospital ou
// procedimento estiver ativo, filtramos instâncias que NÃO casam fora dos
// agregados de leads/contatos.

interface InstanceMapping {
  hospital: string | null;
  procedures: string[];
}

// Procedimentos oferecidos por unidade (usado só pra filtro de procedimento).
const PROCEDURES_BY_HOSPITAL: Record<string, string[]> = {
  HOPE: ["CATARATA", "REFRATIVA"],
  CBV: ["CATARATA", "REFRATIVA", "PLASTICA"],
  HOLHOS: ["CATARATA", "REFRATIVA"],
  CRV: ["CATARATA", "REFRATIVA"],
  "SANTA LUZIA": ["CATARATA", "REFRATIVA"],
};

/**
 * Mapeia o alias da instância para hospital + procedimentos.
 *
 * A derivação de hospital agora delega para o módulo central `hospitalUtils`
 * (`hospitalOf`), eliminando a heurística duplicada que existia aqui. O hospital
 * nunca é null (fallback HOLHOS); o campo permanece tipado como `string | null`
 * só pra compatibilidade com os consumidores existentes.
 */
export function mapInstanceToHospital(alias: string | null | undefined): InstanceMapping {
  const hospital = hospitalOf(alias);
  return { hospital, procedures: PROCEDURES_BY_HOSPITAL[hospital] ?? ["CATARATA", "REFRATIVA"] };
}
