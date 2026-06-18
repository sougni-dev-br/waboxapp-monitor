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
  /** Canal normalizado: GOOGLE | META | TIKTOK | LINKEDIN | OUTRO */
  channel: string;
  /** Texto cru do canal na planilha (pra exibir caso seja "OUTRO") */
  channelRaw: string;
  campaign: string;
  hospital: string;
  cost: number;
  note: string;
}

/**
 * Canoniza o nome do canal de mídia. Aceita variações comuns:
 *   - GOOGLE, GOOGLE ADS, GOOGLEADS, ADWORDS  → "GOOGLE"
 *   - META, FACEBOOK, FB, INSTAGRAM, IG, META ADS → "META"
 *   - TIKTOK, TIK TOK → "TIKTOK"
 *   - LINKEDIN, LINKED IN → "LINKEDIN"
 *   - resto → string normalizada em uppercase
 *
 * Importante: para Meta, agrupamos Facebook/Instagram/FB Ads sob "META" porque
 * o gerenciador é o mesmo (Meta Business Suite); separar não traz visibilidade
 * útil no dashboard, só fragmenta o gráfico.
 */
export function normalizeChannel(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (!s) return "—";
  const u = s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s._\-]/g, "");
  if (u.includes("GOOGLE") || u.includes("ADWORDS")) return "GOOGLE";
  if (u.includes("META") || u.includes("FACEBOOK") || u === "FB" || u.includes("FBADS") || u.includes("INSTAGRAM") || u === "IG") return "META";
  if (u.includes("TIKTOK")) return "TIKTOK";
  if (u.includes("LINKEDIN")) return "LINKEDIN";
  return s.toUpperCase();
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { fetchedAt: number; text: string }>();

async function fetchCsvText(url: string): Promise<string | null> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.text;
  try {
    const res = await fetch(url, { headers: { Accept: "text/csv,text/plain" } });
    if (!res.ok) {
      console.warn(`[sheetsIngest] HTTP ${res.status} ao buscar ${url}`);
      return cached?.text ?? null;
    }
    const text = await res.text();
    cache.set(url, { fetchedAt: Date.now(), text });
    return text;
  } catch (err) {
    console.error("[sheetsIngest] erro fetch:", err);
    return cached?.text ?? null;
  }
}

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

/**
 * Canônica para nomes de hospital. CUSTOS usa "HOLHOS", PIPELINE usa
 * "H.Olhos" — normalizar pra um único nome evita duplicar buckets em
 * breakdowns/cruzamentos.
 */
export function normalizeHospital(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = String(raw).trim();
  if (!s) return "—";
  const u = s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s._\-]/g, "");
  if (u.includes("HOPE")) return "HOPE";
  if (u.includes("CBV")) return "CBV";
  if (u.includes("HOLHOS")) return "HOLHOS";
  if (u.includes("SANTALUZIA") || u.includes("SANTALUZ")) return "SANTA LUZIA";
  if (u.includes("EINSTEIN")) return "EINSTEIN";
  if (u.includes("SIRIO")) return "SIRIO";
  if (u.includes("OFTALMOLOGIA")) return "OFTALMOLOGIA PAULISTA";
  return s;
}

/**
 * URL default — planilha "WABOX 2.0 - DATA", aba CUSTOS publicada como CSV.
 * Pode ser sobrescrita via env var SHEETS_CUSTOS_CSV_URL (ex.: pra trocar a
 * planilha sem precisar de novo deploy).
 */
const DEFAULT_CUSTOS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSnz333oGQxwrQiIhPBTe2DuPjEcWDPIrXRMXxhEFIlvrZYK1l5-bL15BvX4dsn-S1c-UM99OORQYZk/pub?gid=781016203&single=true&output=csv";

/**
 * Procura a linha do header de uma tabela ignorando linhas decorativas
 * (título, subtítulos, KPIs etc). Retorna o índice da linha + array de headers
 * normalizados, ou null se não encontrou.
 */
function findHeaderRow(
  matrix: string[][],
  required: string[]
): { rowIdx: number; headers: string[] } | null {
  for (let i = 0; i < matrix.length; i++) {
    const norm = matrix[i].map(normalizeHeader);
    if (required.every((r) => norm.includes(r))) {
      return { rowIdx: i, headers: norm };
    }
  }
  return null;
}

/** Lê e parseia o CSV das CUSTOS da planilha publicada. */
export async function fetchCustos(): Promise<CustoRow[] | null> {
  const url = process.env.SHEETS_CUSTOS_CSV_URL || DEFAULT_CUSTOS_CSV_URL;
  if (!url) return null;
  const text = await fetchCsvText(url);
  if (text == null) return null;
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
    console.warn("[sheetsIngest] colunas DATA/CUSTO não encontradas em CUSTOS");
    return [];
  }

  const rows: CustoRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    const date = parseDate(r[idx.date] ?? "");
    if (!date) continue;
    const cost = parseMoney(r[idx.cost] ?? "");
    if (cost === 0 && !r[idx.note]) continue;
    const channelRaw = (r[idx.channel] ?? "").trim();
    rows.push({
      date,
      channel: normalizeChannel(channelRaw),
      channelRaw: channelRaw || "—",
      campaign: (r[idx.campaign] ?? "").trim() || "—",
      hospital: normalizeHospital(r[idx.hospital]),
      cost,
      note: (r[idx.note] ?? "").trim(),
    });
  }
  return rows;
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
  /**
   * Totais por canal canônico — atalho pros KPI cards do dashboard sem ter
   * que iterar `byChannel`. Sempre presentes (0 quando não houver lançamento).
   */
  channels: {
    google: number;
    meta: number;
    other: number;
  };
  /** Série diária quebrada por canal canônico, pra gráfico stacked. */
  dailyByChannel: Array<{ date: string; google: number; meta: number; other: number }>;
}

/**
 * Converte as MediaRow da NUCLEO (planilha por hospital×procedimento, com
 * canal Google e Meta em linhas alternadas) no formato CustoRow agnóstico
 * que `getInvestmentSummary` agrega. Essa é a fonte primária desde 2026-06.
 *
 * A planilha "WABOX 2.0 - DATA / CUSTOS" original (lida por `fetchCustos`)
 * só carrega Google e é mantida como fallback.
 */
async function fetchCustosFromMediaCore(): Promise<CustoRow[]> {
  const { getMediaRows } = await import("./mediaInvestment");
  const media = await getMediaRows();
  return media.map((r): CustoRow => {
    const d = r.date;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      date: dateStr,
      channel: normalizeChannel(r.channel),
      channelRaw: r.channel || "—",
      // Sem coluna campanha na NUCLEO — usamos hospital+procedimento como rótulo.
      campaign: r.procedure ? `${r.hospital} · ${r.procedure}` : (r.hospital || "—"),
      hospital: normalizeHospital(r.hospital),
      cost: Number.isFinite(r.cost) ? r.cost : 0,
      note: "",
    };
  });
}

export async function getInvestmentSummary(opts: { dateFrom?: string; dateTo?: string; hospital?: string } = {}): Promise<InvestmentSummary> {
  // Fonte primária: planilha NUCLEO (Google + Meta + outros, com canal por linha).
  // Fallback: planilha WABOX 2.0 - DATA / CUSTOS (legacy, apenas Google).
  let rows: CustoRow[] | null = await fetchCustosFromMediaCore();
  if (!rows || rows.length === 0) {
    rows = await fetchCustos();
  }
  const emptyChannels = { google: 0, meta: 0, other: 0 };
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
      channels: emptyChannels,
      dailyByChannel: [],
    };
  }
  const hospitalFilter = opts.hospital ? normalizeHospital(opts.hospital) : null;
  const scoped = rows.filter(
    (r) =>
      inRange(r.date, opts.dateFrom, opts.dateTo) &&
      (hospitalFilter == null || r.hospital === hospitalFilter)
  );
  const total = scoped.reduce((acc, r) => acc + r.cost, 0);
  const dailyMap = new Map<string, number>();
  for (const r of scoped) dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + r.cost);
  const daily = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, cost]) => ({ date, cost }));

  // Totais por canal canônico e série diária stacked
  const channels = { google: 0, meta: 0, other: 0 };
  const dailyByChMap = new Map<string, { google: number; meta: number; other: number }>();
  for (const r of scoped) {
    const bucket: "google" | "meta" | "other" =
      r.channel === "GOOGLE" ? "google" : r.channel === "META" ? "meta" : "other";
    channels[bucket] += r.cost;
    const e = dailyByChMap.get(r.date) ?? { google: 0, meta: 0, other: 0 };
    e[bucket] += r.cost;
    dailyByChMap.set(r.date, e);
  }
  const dailyByChannel = Array.from(dailyByChMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));

  return {
    total,
    lines: scoped.length,
    source: "sheet",
    range: { from: opts.dateFrom ?? null, to: opts.dateTo ?? null },
    byChannel: aggBy(scoped, (r) => r.channel),
    byCampaign: aggBy(scoped, (r) => r.campaign),
    byHospital: aggBy(scoped, (r) => r.hospital),
    daily,
    channels,
    dailyByChannel,
  };
}

// ─── PIPELINE ────────────────────────────────────────────────────────────────

const DEFAULT_PIPELINE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSnz333oGQxwrQiIhPBTe2DuPjEcWDPIrXRMXxhEFIlvrZYK1l5-bL15BvX4dsn-S1c-UM99OORQYZk/pub?gid=590382630&single=true&output=csv";

export interface PipelineLead {
  /** YYYY-MM-DD da entrada do lead */
  dateEntered: string;
  phone: string;
  name: string;
  hospital: string;
  procedure: string;
  channel: string;
  campaign: string;
  /** YYYY-MM-DD da data agendada (opcional) */
  dateScheduled: string | null;
  /** YYYY-MM-DD da consulta realizada (opcional) */
  dateConsultation: string | null;
  /** YYYY-MM-DD da cirurgia (opcional) */
  dateSurgery: string | null;
  /** Valor da cirurgia (0 se ainda não realizada) */
  surgeryValue: number;
  lossReason: string;
  status:
    | "Lead"
    | "Consulta agendada"
    | "Consulta realizada"
    | "Cirurgia realizada"
    | "Perdido"
    | "—";
}

function computeStatus(r: {
  dateScheduled: string | null;
  dateConsultation: string | null;
  dateSurgery: string | null;
  lossReason: string;
}): PipelineLead["status"] {
  if (r.lossReason && r.lossReason.length > 0) return "Perdido";
  if (r.dateSurgery) return "Cirurgia realizada";
  if (r.dateConsultation) return "Consulta realizada";
  if (r.dateScheduled) return "Consulta agendada";
  return "Lead";
}

export async function fetchPipelineLeads(): Promise<PipelineLead[] | null> {
  const url = process.env.SHEETS_PIPELINE_CSV_URL || DEFAULT_PIPELINE_CSV_URL;
  if (!url) return null;
  const text = await fetchCsvText(url);
  if (text == null) return null;
  const matrix = parseCSV(text);
  if (matrix.length === 0) return [];

  // Procura header com colunas mínimas obrigatórias
  const headerInfo = findHeaderRow(matrix, ["dataentrada", "telefone", "hospital"]);
  if (!headerInfo) {
    console.warn("[sheetsIngest] header da PIPELINE não encontrado (DATA ENTRADA / TELEFONE / HOSPITAL)");
    return [];
  }

  const h = headerInfo.headers;
  const idx = {
    dateEntered: h.findIndex((c) => c === "dataentrada"),
    phone: h.findIndex((c) => c === "telefone"),
    name: h.findIndex((c) => c === "nome"),
    hospital: h.findIndex((c) => c === "hospital"),
    procedure: h.findIndex((c) => c === "procedimento"),
    channel: h.findIndex((c) => c === "canal"),
    campaign: h.findIndex((c) => c === "campanha"),
    dateScheduled: h.findIndex((c) => c === "dataagendada"),
    dateConsultation: h.findIndex((c) => c === "dataconsulta"),
    dateSurgery: h.findIndex((c) => c === "datacirurgia"),
    surgeryValue: h.findIndex((c) => c.startsWith("valorcirurgia")),
    lossReason: h.findIndex((c) => c.startsWith("motivoperda") || c === "motivoperda"),
  };

  const leads: PipelineLead[] = [];
  for (let i = headerInfo.rowIdx + 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r.some((c) => c.trim())) continue;
    const dateEntered = parseDate(r[idx.dateEntered] ?? "");
    const phone = (r[idx.phone] ?? "").trim();
    if (!dateEntered || !phone) continue;
    const dateScheduled = parseDate(r[idx.dateScheduled] ?? "");
    const dateConsultation = parseDate(r[idx.dateConsultation] ?? "");
    const dateSurgery = parseDate(r[idx.dateSurgery] ?? "");
    const surgeryValue = parseMoney(r[idx.surgeryValue] ?? "");
    const lossReason = (r[idx.lossReason] ?? "").trim();
    leads.push({
      dateEntered,
      phone,
      name: (r[idx.name] ?? "").trim(),
      hospital: normalizeHospital(r[idx.hospital]),
      procedure: (r[idx.procedure] ?? "").trim() || "—",
      channel: (r[idx.channel] ?? "").trim() || "—",
      campaign: (r[idx.campaign] ?? "").trim() || "—",
      dateScheduled,
      dateConsultation,
      dateSurgery,
      surgeryValue,
      lossReason,
      status: computeStatus({ dateScheduled, dateConsultation, dateSurgery, lossReason }),
    });
  }
  return leads;
}

// ─── Pipeline aggregations ───────────────────────────────────────────────────

export interface PipelineSummary {
  source: "sheet" | "unavailable" | "empty";
  range: { from: string | null; to: string | null };
  /** Funil: counts em cada etapa */
  funnel: {
    leads: number;
    scheduled: number;
    consulted: number;
    surgeries: number;
    lost: number;
  };
  /** Conversões em % */
  conversion: {
    leadToScheduled: number;
    scheduledToConsulted: number;
    consultedToSurgery: number;
    leadToSurgery: number;
  };
  /** Financeiro */
  revenue: number;
  averageTicket: number;
  /** Tempo médio em dias entre etapas */
  funnelTime: {
    leadToScheduledDays: number | null;
    scheduledToConsultedDays: number | null;
    consultedToSurgeryDays: number | null;
  };
  /** Distribuição por hospital */
  byHospital: Array<{ key: string; leads: number; surgeries: number; revenue: number }>;
  byChannel: Array<{ key: string; leads: number; surgeries: number; revenue: number }>;
  byProcedure: Array<{ key: string; leads: number; surgeries: number; revenue: number }>;
  /** Motivos de perda */
  lossReasons: Array<{ key: string; count: number }>;
  /** Série diária de leads no período */
  dailyLeads: Array<{ date: string; leads: number; surgeries: number }>;
}

function avgDays(from: (l: PipelineLead) => string | null, to: (l: PipelineLead) => string | null, leads: PipelineLead[]): number | null {
  const diffs: number[] = [];
  for (const l of leads) {
    const a = from(l);
    const b = to(l);
    if (!a || !b) continue;
    const ta = new Date(a + "T12:00:00Z").getTime();
    const tb = new Date(b + "T12:00:00Z").getTime();
    if (Number.isNaN(ta) || Number.isNaN(tb)) continue;
    const days = (tb - ta) / (1000 * 60 * 60 * 24);
    if (days >= 0) diffs.push(days);
  }
  if (diffs.length === 0) return null;
  return diffs.reduce((acc, n) => acc + n, 0) / diffs.length;
}

function safePct(num: number, den: number): number {
  if (den === 0) return 0;
  return (num / den) * 100;
}

function aggGroup(leads: PipelineLead[], pick: (l: PipelineLead) => string) {
  const map = new Map<string, { leads: number; surgeries: number; revenue: number }>();
  for (const l of leads) {
    const k = pick(l) || "—";
    const e = map.get(k) ?? { leads: 0, surgeries: 0, revenue: 0 };
    e.leads += 1;
    if (l.dateSurgery) { e.surgeries += 1; e.revenue += l.surgeryValue; }
    map.set(k, e);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
}

export async function getPipelineSummary(opts: { dateFrom?: string; dateTo?: string; hospital?: string } = {}): Promise<PipelineSummary> {
  const empty: PipelineSummary = {
    source: "unavailable",
    range: { from: opts.dateFrom ?? null, to: opts.dateTo ?? null },
    funnel: { leads: 0, scheduled: 0, consulted: 0, surgeries: 0, lost: 0 },
    conversion: { leadToScheduled: 0, scheduledToConsulted: 0, consultedToSurgery: 0, leadToSurgery: 0 },
    revenue: 0,
    averageTicket: 0,
    funnelTime: { leadToScheduledDays: null, scheduledToConsultedDays: null, consultedToSurgeryDays: null },
    byHospital: [],
    byChannel: [],
    byProcedure: [],
    lossReasons: [],
    dailyLeads: [],
  };

  const leads = await fetchPipelineLeads();
  if (leads === null) return empty;

  const hospitalFilter = opts.hospital ? normalizeHospital(opts.hospital) : null;
  const scoped = leads.filter(
    (l) =>
      inRange(l.dateEntered, opts.dateFrom, opts.dateTo) &&
      (hospitalFilter == null || l.hospital === hospitalFilter)
  );

  if (scoped.length === 0) {
    return { ...empty, source: leads.length === 0 ? "empty" : "empty" };
  }

  const scheduled = scoped.filter((l) => !!l.dateScheduled).length;
  const consulted = scoped.filter((l) => !!l.dateConsultation).length;
  const surgeries = scoped.filter((l) => !!l.dateSurgery).length;
  const lost = scoped.filter((l) => l.lossReason.length > 0).length;
  const revenue = scoped.reduce((acc, l) => acc + (l.dateSurgery ? l.surgeryValue : 0), 0);

  const dailyMap = new Map<string, { leads: number; surgeries: number }>();
  for (const l of scoped) {
    const e = dailyMap.get(l.dateEntered) ?? { leads: 0, surgeries: 0 };
    e.leads += 1;
    if (l.dateSurgery) e.surgeries += 1;
    dailyMap.set(l.dateEntered, e);
  }

  const lossMap = new Map<string, number>();
  for (const l of scoped) {
    if (!l.lossReason) continue;
    lossMap.set(l.lossReason, (lossMap.get(l.lossReason) ?? 0) + 1);
  }

  return {
    source: "sheet",
    range: { from: opts.dateFrom ?? null, to: opts.dateTo ?? null },
    funnel: {
      leads: scoped.length,
      scheduled,
      consulted,
      surgeries,
      lost,
    },
    conversion: {
      leadToScheduled: safePct(scheduled, scoped.length),
      scheduledToConsulted: safePct(consulted, scheduled),
      consultedToSurgery: safePct(surgeries, consulted),
      leadToSurgery: safePct(surgeries, scoped.length),
    },
    revenue,
    averageTicket: surgeries > 0 ? revenue / surgeries : 0,
    funnelTime: {
      leadToScheduledDays: avgDays((l) => l.dateEntered, (l) => l.dateScheduled, scoped),
      scheduledToConsultedDays: avgDays((l) => l.dateScheduled, (l) => l.dateConsultation, scoped),
      consultedToSurgeryDays: avgDays((l) => l.dateConsultation, (l) => l.dateSurgery, scoped),
    },
    byHospital: aggGroup(scoped, (l) => l.hospital),
    byChannel: aggGroup(scoped, (l) => l.channel),
    byProcedure: aggGroup(scoped, (l) => l.procedure),
    lossReasons: Array.from(lossMap.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    dailyLeads: Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, leads: v.leads, surgeries: v.surgeries })),
  };
}
