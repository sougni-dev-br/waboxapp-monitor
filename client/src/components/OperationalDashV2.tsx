/**
 * Dashboard Operacional Sougni — V3 (zero mock).
 *
 * Fontes de dados:
 *   1. Aba CUSTOS da planilha publicada (trpc.dashboard.investment)
 *   2. Aba PIPELINE da planilha publicada (trpc.dashboard.pipeline)
 *   3. Banco de dados do monitor (trpc.dashboard.overview)
 *
 * Tudo respeita o seletor de período global (DateRangeContext).
 */
import { useMemo } from "react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useDateRange } from "@/contexts/DateRangeContext";
import { format as fmtDate, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  Wallet,
  Users,
  MessageCircle,
  Timer,
  Activity,
  TrendingUp,
  Tag,
  Smartphone,
  AlertCircle,
  Sparkles,
  Clock,
  CheckCircle2,
  Target,
  CalendarCheck,
  Stethoscope,
  Scissors,
  ChevronRight,
  TrendingDown,
  DollarSign,
  UserCheck,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMoney = (v: number, frac = 0) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });

const fmtNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

const fmtDayShort = (iso: string) => {
  try {
    return fmtDate(parseISO(iso), "dd/MM", { locale: ptBR });
  } catch {
    return iso;
  }
};

// ─── Section wrapper com fade-in ─────────────────────────────────────────────

function Section({
  index,
  title,
  subtitle,
  children,
}: {
  index: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mt-16 first:mt-8"
    >
      <div className="flex items-baseline gap-4 mb-6">
        <span className="text-[11px] font-medium text-gray-400 tracking-[0.2em]">{index}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
      </div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900 leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </motion.section>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  hint,
  accent = "bg-[#DFFF00]/15",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-200 p-5 overflow-hidden">
      <div
        className={`absolute top-0 right-0 w-24 h-24 rounded-full ${accent} blur-2xl opacity-50 -translate-y-6 translate-x-6`}
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-[#11131F] tabular truncate">{value}</p>
        {hint && <p className="mt-1 text-[11px] text-gray-500 truncate">{hint}</p>}
      </div>
    </div>
  );
}

// ─── Breakdown bar list ──────────────────────────────────────────────────────

function BreakdownCard({
  title,
  items,
  total,
  accent = "#11131F",
  formatValue,
  full = false,
}: {
  title: string;
  items: { key: string; total: number; rows?: number }[];
  total: number;
  accent?: string;
  formatValue?: (v: number) => string;
  full?: boolean;
}) {
  if (items.length === 0) return null;
  const fmt = formatValue ?? ((v: number) => fmtMoney(v));
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">{title}</p>
      <div className={`space-y-2.5 ${full ? "" : "max-h-72 overflow-y-auto pr-1"}`}>
        {items.map((it) => {
          const pct = total > 0 ? (it.total / total) * 100 : 0;
          return (
            <div key={it.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-[#11131F] truncate" title={it.key}>
                  {it.key}
                </span>
                <span className="text-gray-500 tabular ml-3 flex-shrink-0">
                  {fmt(it.total)} <span className="text-gray-300">·</span> {pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(pct, 1.5)}%`, background: accent }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Estado vazio ────────────────────────────────────────────────────────────

function EmptyState({
  title,
  description,
  icon: Icon = Activity,
}: {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
      <div className="w-10 h-10 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-[#11131F]">{title}</p>
      <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">{description}</p>
    </div>
  );
}

// ─── Investment Section (REAL — planilha CUSTOS) ─────────────────────────────

interface InvestmentPayload {
  total: number;
  lines: number;
  source: "sheet" | "unavailable";
  byChannel: { key: string; total: number; rows: number }[];
  byCampaign: { key: string; total: number; rows: number }[];
  byHospital: { key: string; total: number; rows: number }[];
  daily: { date: string; cost: number }[];
}

function InvestmentSection({
  data,
  leads,
}: {
  data: InvestmentPayload | undefined;
  leads: number;
}) {
  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <p className="text-sm text-gray-400">Carregando custos da planilha...</p>
      </div>
    );
  }

  if (data.source === "unavailable") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700" />
          <p className="text-sm font-semibold text-amber-900">Aba CUSTOS ainda não conectada</p>
        </div>
        <p className="text-xs text-amber-800/80 leading-relaxed">
          Publique a aba <b>CUSTOS</b> da planilha como CSV (Arquivo → Compartilhar → Publicar na
          web → CUSTOS + Valores separados por vírgula) e cole a URL no Render como{" "}
          <code className="bg-amber-100 px-1 rounded">SHEETS_CUSTOS_CSV_URL</code>.
        </p>
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <EmptyState
        title="Sem custos no período selecionado"
        description="A aba CUSTOS está conectada, mas não há lançamentos dentro do range do filtro."
        icon={Wallet}
      />
    );
  }

  const cpl = leads > 0 ? data.total / leads : null;
  const topChannel = data.byChannel[0];
  const topCampaign = data.byCampaign[0];
  const topHospital = data.byHospital[0];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Investimento total"
          value={fmtMoney(data.total)}
          hint={`${data.lines} lançamento${data.lines === 1 ? "" : "s"}`}
          accent="bg-[#DFFF00]/30"
          icon={Wallet}
        />
        <KPICard
          label="CPL (Custo por Lead)"
          value={cpl != null ? fmtMoney(cpl, 2) : "—"}
          hint={leads > 0 ? `${fmtNum(leads)} leads no período` : "Sem leads ainda"}
          accent="bg-emerald-50"
          icon={Target}
        />
        <KPICard
          label="Canal #1"
          value={topChannel?.key ?? "—"}
          hint={topChannel ? fmtMoney(topChannel.total) : ""}
          accent="bg-blue-50"
          icon={TrendingUp}
        />
        <KPICard
          label="Hospital #1"
          value={topHospital?.key ?? "—"}
          hint={topHospital ? fmtMoney(topHospital.total) : ""}
          accent="bg-rose-50"
          icon={Sparkles}
        />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownCard title="Por canal" items={data.byChannel} total={data.total} />
        <BreakdownCard title="Por hospital" items={data.byHospital} total={data.total} />
      </div>
      <BreakdownCard
        title="Top campanhas"
        items={data.byCampaign.slice(0, 10)}
        total={data.total}
        full
      />

      {/* Série diária */}
      {data.daily.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                Investimento diário
              </p>
              <p className="text-sm text-gray-900 font-semibold">
                {data.daily.length} {data.daily.length === 1 ? "dia" : "dias"} com lançamentos
              </p>
            </div>
            <p className="text-xs text-gray-400">
              Pico: {fmtMoney(Math.max(...data.daily.map((d) => d.cost)))}
            </p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={fmtDayShort}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v) => `R$ ${Math.round(v / 1000)}k`}
              />
              <RTooltip
                formatter={(v: number) => [fmtMoney(v), "Custo"]}
                labelFormatter={(l) => fmtDayShort(String(l))}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Bar dataKey="cost" fill="#11131F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-[11px] text-gray-400 text-center">
        Fonte: aba CUSTOS da planilha · atualiza a cada 5 min
        {topCampaign && (
          <>
            {" "}
            · Campanha #1: <b className="text-[#11131F]">{topCampaign.key}</b> (
            {fmtMoney(topCampaign.total)})
          </>
        )}
      </p>
    </div>
  );
}

// ─── Leads Section (REAL — monitor) ──────────────────────────────────────────

interface OverviewPayload {
  totalLeadsInPeriod: number;
  contactedLeadsInPeriod: number;
  contactedLeadsPercent: number;
  validLeadsPercent: number;
  invalidLeadsPercent: number;
  avgTimeToFirstContactMinutes: number | null;
  respondedWithin5MinPercent: number;
  totalMessages: number;
  messagesLast24h: number;
  instancesOnline: number;
  instancesOffline: number;
  instancesTotal: number;
  dailySeries: Array<{ date: string; newContacts: number; messages: number }>;
  labelDistribution: Array<{
    labelId: number;
    labelName: string;
    labelColor: string;
    count: number;
  }>;
  operationDistribution: Array<{
    instanceId: number;
    alias: string;
    uid: string;
    color: string;
    count: number;
  }>;
  topInstances: Array<{
    instanceId: number;
    alias: string;
    uid: string;
    contactCount: number;
    messageCount: number;
    status: string;
  }>;
  hourlyHeatmap: Array<{ hour: number; count: number }>;
}

function LeadsSection({ overview }: { overview: OverviewPayload | undefined }) {
  if (!overview) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <p className="text-sm text-gray-400">Carregando dados do monitor...</p>
      </div>
    );
  }

  if (overview.totalLeadsInPeriod === 0) {
    return (
      <EmptyState
        title="Nenhum lead no período"
        description="Não há contatos do monitor (waboxapp) com primeira mensagem dentro do range selecionado."
        icon={Users}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Gráfico diário */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
              Volume diário
            </p>
            <p className="text-sm text-gray-900 font-semibold">
              {fmtNum(overview.totalLeadsInPeriod)} leads ·{" "}
              {fmtNum(overview.totalMessages)} mensagens
            </p>
          </div>
          <p className="text-xs text-gray-400">
            Pico:{" "}
            {fmtNum(
              Math.max(...overview.dailySeries.map((d) => d.newContacts), 0)
            )}{" "}
            leads/dia
          </p>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={overview.dailySeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={fmtDayShort}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <RTooltip
              formatter={(v: number, name: string) => [
                fmtNum(v),
                name === "newContacts" ? "Leads" : "Mensagens",
              ]}
              labelFormatter={(l) => fmtDayShort(String(l))}
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="newContacts"
              stroke="#11131F"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: "#DFFF00", stroke: "#11131F", strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="messages"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown por instância e etiqueta */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {overview.operationDistribution.length > 0 && (
          <BreakdownCard
            title="Leads por operação (instância)"
            items={overview.operationDistribution.map((o) => ({
              key: o.alias || o.uid,
              total: o.count,
            }))}
            total={overview.operationDistribution.reduce((acc, o) => acc + o.count, 0)}
            accent="#11131F"
            formatValue={(v) => fmtNum(v)}
          />
        )}
        {overview.labelDistribution.length > 0 && (
          <BreakdownCard
            title="Leads por etiqueta"
            items={overview.labelDistribution.map((l) => ({ key: l.labelName, total: l.count }))}
            total={overview.labelDistribution.reduce((acc, l) => acc + l.count, 0)}
            accent="#11131F"
            formatValue={(v) => fmtNum(v)}
          />
        )}
      </div>

      {/* Top instâncias por volume */}
      {overview.topInstances.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">
            Top instâncias por volume (contatos + mensagens)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {overview.topInstances.slice(0, 6).map((inst) => (
              <div
                key={inst.instanceId}
                className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/40"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      inst.status === "online" ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm font-medium text-[#11131F] truncate">
                    {inst.alias || inst.uid}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-[#11131F] tabular">
                    {fmtNum(inst.contactCount)}
                  </p>
                  <p className="text-[10px] text-gray-400">{fmtNum(inst.messageCount)} msgs</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quality Section (REAL — monitor) ────────────────────────────────────────

function QualitySection({ overview }: { overview: OverviewPayload | undefined }) {
  if (!overview) return null;
  if (overview.totalLeadsInPeriod === 0) return null;

  const QUALITY_PIE = [
    { name: "Válidos", value: overview.validLeadsPercent, color: "#11131F" },
    { name: "Inválidos", value: overview.invalidLeadsPercent, color: "#e2e8f0" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Leads contatados"
          value={`${overview.contactedLeadsPercent.toFixed(1)}%`}
          hint={`${fmtNum(overview.contactedLeadsInPeriod)} de ${fmtNum(
            overview.totalLeadsInPeriod
          )}`}
          accent="bg-emerald-50"
          icon={CheckCircle2}
        />
        <KPICard
          label="Tempo até 1º contato"
          value={
            overview.avgTimeToFirstContactMinutes != null
              ? `${overview.avgTimeToFirstContactMinutes.toFixed(1)} min`
              : "—"
          }
          hint="Média do período"
          accent="bg-amber-50"
          icon={Timer}
        />
        <KPICard
          label="Respondidos em ≤5min"
          value={`${overview.respondedWithin5MinPercent.toFixed(1)}%`}
          hint="Alvo: ≥80%"
          accent="bg-blue-50"
          icon={Clock}
        />
        <KPICard
          label="Leads válidos"
          value={`${overview.validLeadsPercent.toFixed(1)}%`}
          hint="Lead respondeu pelo menos 1×"
          accent="bg-violet-50"
          icon={Activity}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut válidos/inválidos */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
            Qualidade da base
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={QUALITY_PIE}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
              >
                {QUALITY_PIE.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <RTooltip
                formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-around text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#11131F]" />
              <span className="text-gray-600">
                Válidos <b className="text-[#11131F]">{overview.validLeadsPercent.toFixed(1)}%</b>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-200" />
              <span className="text-gray-600">
                Inválidos{" "}
                <b className="text-[#11131F]">{overview.invalidLeadsPercent.toFixed(1)}%</b>
              </span>
            </div>
          </div>
        </div>

        {/* Heatmap horário */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 lg:col-span-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">
            Distribuição horária dos leads
          </p>
          <HourlyHeatmap data={overview.hourlyHeatmap} />
        </div>
      </div>
    </div>
  );
}

function HourlyHeatmap({ data }: { data: OverviewPayload["hourlyHeatmap"] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const hours = Array.from({ length: 24 }, (_, h) => {
    const found = data.find((d) => d.hour === h);
    return { hour: h, count: found?.count ?? 0 };
  });
  return (
    <div className="grid grid-cols-12 gap-1.5">
      {hours.map((h) => {
        const intensity = h.count / maxCount;
        const bg = h.count === 0
          ? "#f1f5f9"
          : `rgba(17,19,31, ${Math.max(0.1, intensity)})`;
        return (
          <div key={h.hour} className="flex flex-col items-center gap-1" title={`${h.hour}h — ${h.count} leads`}>
            <div
              className="w-full aspect-square rounded-md border border-white"
              style={{ background: bg }}
            />
            <span className="text-[9px] text-gray-400 tabular">{h.hour}h</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Infrastructure Section (REAL — monitor) ─────────────────────────────────

function InfraSection({ overview }: { overview: OverviewPayload | undefined }) {
  if (!overview) return null;
  const uptime =
    overview.instancesTotal > 0
      ? (overview.instancesOnline / overview.instancesTotal) * 100
      : 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        label="Canais online"
        value={`${overview.instancesOnline}/${overview.instancesTotal}`}
        hint={`${uptime.toFixed(0)}% disponíveis`}
        accent={overview.instancesOffline > 0 ? "bg-rose-50" : "bg-emerald-50"}
        icon={Smartphone}
      />
      <KPICard
        label="Mensagens (24h)"
        value={fmtNum(overview.messagesLast24h)}
        hint={`${fmtNum(overview.totalMessages)} total na base`}
        accent="bg-blue-50"
        icon={MessageCircle}
      />
      <KPICard
        label="Total de contatos"
        value={fmtNum(overview.totalLeadsInPeriod)}
        hint="No período filtrado"
        accent="bg-[#DFFF00]/30"
        icon={Users}
      />
      <KPICard
        label="Etiquetas ativas"
        value={fmtNum(overview.labelDistribution.length)}
        hint={`${fmtNum(overview.labelDistribution.reduce((a, l) => a + l.count, 0))} leads marcados`}
        accent="bg-violet-50"
        icon={Tag}
      />
    </div>
  );
}

// ─── Pipeline Section (REAL — aba PIPELINE) ─────────────────────────────────

interface PipelinePayload {
  source: "sheet" | "unavailable" | "empty";
  funnel: { leads: number; scheduled: number; consulted: number; surgeries: number; lost: number };
  conversion: {
    leadToScheduled: number;
    scheduledToConsulted: number;
    consultedToSurgery: number;
    leadToSurgery: number;
  };
  revenue: number;
  averageTicket: number;
  funnelTime: {
    leadToScheduledDays: number | null;
    scheduledToConsultedDays: number | null;
    consultedToSurgeryDays: number | null;
  };
  byHospital: Array<{ key: string; leads: number; surgeries: number; revenue: number }>;
  byChannel: Array<{ key: string; leads: number; surgeries: number; revenue: number }>;
  byProcedure: Array<{ key: string; leads: number; surgeries: number; revenue: number }>;
  lossReasons: Array<{ key: string; count: number }>;
  dailyLeads: Array<{ date: string; leads: number; surgeries: number }>;
}

function FunnelSection({ data }: { data: PipelinePayload | undefined }) {
  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <p className="text-sm text-gray-400">Carregando funil da planilha...</p>
      </div>
    );
  }
  if (data.source === "unavailable") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700" />
          <p className="text-sm font-semibold text-amber-900">Aba PIPELINE ainda não conectada</p>
        </div>
        <p className="text-xs text-amber-800/80 leading-relaxed">
          Publique a aba PIPELINE da planilha como CSV pelo Arquivo → Compartilhar → Publicar na
          web.
        </p>
      </div>
    );
  }
  if (data.source === "empty" || data.funnel.leads === 0) {
    return (
      <EmptyState
        title="Sem leads lançados no período"
        description="A aba PIPELINE está conectada, mas não há leads com DATA ENTRADA dentro do range do filtro. Lance um lead por linha na PIPELINE pra ver o funil, SDRs, conversões e ROAS."
        icon={Users}
      />
    );
  }

  const f = data.funnel;
  const c = data.conversion;
  const stages = [
    { key: "Leads", value: f.leads, color: "#11131F", icon: Users },
    { key: "Agendados", value: f.scheduled, color: "#1f2238", icon: CalendarCheck, conv: c.leadToScheduled },
    { key: "Consultas", value: f.consulted, color: "#3a3d52", icon: Stethoscope, conv: c.scheduledToConsulted },
    { key: "Cirurgias", value: f.surgeries, color: "#DFFF00", icon: Scissors, conv: c.consultedToSurgery },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs principais do funil */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Leads no período"
          value={fmtNum(f.leads)}
          hint={`${fmtNum(f.lost)} perdidos`}
          accent="bg-[#DFFF00]/30"
          icon={Users}
        />
        <KPICard
          label="Conv Lead → Cirurgia"
          value={`${c.leadToSurgery.toFixed(1)}%`}
          hint={`${fmtNum(f.surgeries)} cirurgias`}
          accent="bg-emerald-50"
          icon={Target}
        />
        <KPICard
          label="Taxa de agendamento"
          value={`${c.leadToScheduled.toFixed(1)}%`}
          hint={`${fmtNum(f.scheduled)} agendadas`}
          accent="bg-blue-50"
          icon={CalendarCheck}
        />
        <KPICard
          label="Show-up consultas"
          value={`${c.scheduledToConsulted.toFixed(1)}%`}
          hint={`${fmtNum(f.consulted)} compareceram`}
          accent="bg-violet-50"
          icon={UserCheck}
        />
      </div>

      {/* Funil visual horizontal */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-4">
          Funil de vendas
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {stages.map((s, i) => {
            const widthPct = f.leads > 0 ? (s.value / f.leads) * 100 : 0;
            const Icon = s.icon;
            return (
              <div key={s.key} className="relative">
                <div
                  className="rounded-xl p-4 text-white relative overflow-hidden"
                  style={{ background: s.color }}
                >
                  <div className="absolute top-2 right-2 opacity-30">
                    <Icon className="w-6 h-6" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                    {s.key}
                  </p>
                  <p className={`mt-2 text-3xl font-bold tabular ${s.color === "#DFFF00" ? "text-[#11131F]" : ""}`}>
                    {fmtNum(s.value)}
                  </p>
                  <p className={`mt-1 text-[10px] ${s.color === "#DFFF00" ? "text-[#11131F]/70" : "opacity-70"}`}>
                    {widthPct.toFixed(0)}% do topo
                    {s.conv != null && i > 0 && (
                      <> · conv {s.conv.toFixed(0)}%</>
                    )}
                  </p>
                </div>
                {i < stages.length - 1 && (
                  <ChevronRight className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 z-10" />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <FunnelTimeChip
            label="Lead → Agenda"
            days={data.funnelTime.leadToScheduledDays}
          />
          <FunnelTimeChip
            label="Agenda → Consulta"
            days={data.funnelTime.scheduledToConsultedDays}
          />
          <FunnelTimeChip
            label="Consulta → Cirurgia"
            days={data.funnelTime.consultedToSurgeryDays}
          />
        </div>
      </div>

      {/* Gráfico diário de entrada vs cirurgias */}
      {data.dailyLeads.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                Entrada diária de leads
              </p>
              <p className="text-sm text-gray-900 font-semibold">
                {fmtNum(f.leads)} leads ·{" "}
                {fmtNum(f.surgeries)} cirurgia{f.surgeries === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.dailyLeads}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={fmtDayShort}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <RTooltip
                formatter={(v: number, name: string) => [
                  fmtNum(v),
                  name === "leads" ? "Leads" : "Cirurgias",
                ]}
                labelFormatter={(l) => fmtDayShort(String(l))}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Bar dataKey="leads" fill="#11131F" radius={[4, 4, 0, 0]} />
              <Bar dataKey="surgeries" fill="#DFFF00" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function FunnelTimeChip({ label, days }: { label: string; days: number | null }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-[#11131F] tabular">
        {days != null ? `${days.toFixed(1)} dias` : "—"}
      </span>
    </div>
  );
}

// ─── Financial Section (CUSTOS + PIPELINE) ───────────────────────────────────

function FinancialSection({
  investment,
  pipeline,
}: {
  investment: InvestmentPayload | undefined;
  pipeline: PipelinePayload | undefined;
}) {
  if (!investment || !pipeline) return null;

  const inv = investment.source === "sheet" ? investment.total : 0;
  const revenue = pipeline.source === "sheet" ? pipeline.revenue : 0;
  const surgeries = pipeline.funnel.surgeries;
  const ticket = pipeline.averageTicket;
  const cac = surgeries > 0 ? inv / surgeries : null;
  const roas = inv > 0 ? revenue / inv : null;
  const roi = inv > 0 ? ((revenue - inv) / inv) * 100 : null;

  const hasAny = inv > 0 || revenue > 0;
  if (!hasAny) {
    return (
      <EmptyState
        title="Sem dados financeiros"
        description="Lance custos na aba CUSTOS e leads/cirurgias na aba PIPELINE pra ver receita, ticket, CAC, ROAS e ROI."
        icon={DollarSign}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Receita total"
          value={fmtMoney(revenue)}
          hint={`${fmtNum(surgeries)} cirurgia${surgeries === 1 ? "" : "s"}`}
          accent="bg-emerald-50"
          icon={DollarSign}
        />
        <KPICard
          label="Ticket médio"
          value={ticket > 0 ? fmtMoney(ticket) : "—"}
          hint="Receita ÷ cirurgias"
          accent="bg-[#DFFF00]/30"
          icon={Sparkles}
        />
        <KPICard
          label="CAC por cirurgia"
          value={cac != null ? fmtMoney(cac) : "—"}
          hint="Investimento ÷ cirurgias"
          accent="bg-amber-50"
          icon={Wallet}
        />
        <KPICard
          label="ROAS"
          value={roas != null ? `${roas.toFixed(2)}x` : "—"}
          hint={
            roi != null
              ? roi >= 0
                ? `ROI +${roi.toFixed(0)}%`
                : `ROI ${roi.toFixed(0)}%`
              : "Sem investimento"
          }
          accent={roas != null && roas >= 1 ? "bg-emerald-50" : "bg-rose-50"}
          icon={roas != null && roas >= 1 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Performance por hospital / canal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PerformanceTable
          title="Performance por hospital"
          rows={pipeline.byHospital.slice(0, 6)}
        />
        <PerformanceTable
          title="Performance por canal"
          rows={pipeline.byChannel.slice(0, 6)}
        />
      </div>
    </div>
  );
}

function PerformanceTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; leads: number; surgeries: number; revenue: number }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">{title}</p>
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-1 border-b border-gray-100">
          <span className="col-span-5">Nome</span>
          <span className="col-span-2 text-right">Leads</span>
          <span className="col-span-2 text-right">Cirurg.</span>
          <span className="col-span-3 text-right">Receita</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-12 gap-2 text-xs items-center py-1">
            <span className="col-span-5 font-medium text-[#11131F] truncate" title={r.key}>
              {r.key}
            </span>
            <span className="col-span-2 text-right tabular text-gray-600">{fmtNum(r.leads)}</span>
            <span className="col-span-2 text-right tabular text-gray-600">
              {fmtNum(r.surgeries)}
            </span>
            <span className="col-span-3 text-right tabular font-semibold text-[#11131F]">
              {r.revenue > 0 ? fmtMoney(r.revenue) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Losses + Procedure Section ──────────────────────────────────────────────

function LossesSection({ pipeline }: { pipeline: PipelinePayload | undefined }) {
  if (!pipeline || pipeline.source !== "sheet" || pipeline.funnel.leads === 0) return null;

  const hasProcedures = pipeline.byProcedure.length > 0;
  const hasLosses = pipeline.lossReasons.length > 0;

  if (!hasProcedures && !hasLosses) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Performance por procedimento */}
      {hasProcedures && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">
            Performance por procedimento
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold pb-1 border-b border-gray-100">
              <span className="col-span-5">Procedimento</span>
              <span className="col-span-2 text-right">Leads</span>
              <span className="col-span-2 text-right">Cirurg.</span>
              <span className="col-span-3 text-right">Receita</span>
            </div>
            {pipeline.byProcedure.slice(0, 6).map((p) => (
              <div key={p.key} className="grid grid-cols-12 gap-2 text-xs items-center py-1">
                <span className="col-span-5 font-medium text-[#11131F] truncate" title={p.key}>
                  {p.key}
                </span>
                <span className="col-span-2 text-right tabular text-gray-600">{fmtNum(p.leads)}</span>
                <span className="col-span-2 text-right tabular text-gray-600">
                  {fmtNum(p.surgeries)}
                </span>
                <span className="col-span-3 text-right tabular font-semibold text-[#11131F]">
                  {p.revenue > 0 ? fmtMoney(p.revenue) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Motivos de perda */}
      {hasLosses && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">
            Motivos de perda
          </p>
          <div className="space-y-2.5">
            {pipeline.lossReasons.slice(0, 8).map((r) => {
              const totalLost = pipeline.lossReasons.reduce((acc, x) => acc + x.count, 0);
              const pct = totalLost > 0 ? (r.count / totalLost) * 100 : 0;
              return (
                <div key={r.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5 font-medium text-[#11131F] truncate">
                      <XCircle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                      {r.key}
                    </span>
                    <span className="text-gray-500 tabular ml-3">
                      {fmtNum(r.count)} <span className="text-gray-300">·</span> {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-300"
                      style={{ width: `${Math.max(pct, 1.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function OperationalDashV2() {
  const { from, to, fromISO, toISO, days } = useDateRange();

  const queryInput = useMemo(
    () => ({ dateFrom: fromISO, dateTo: toISO }),
    [fromISO, toISO]
  );

  const { data: overview } = trpc.dashboard.overview.useQuery(queryInput, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: investment } = trpc.dashboard.investment.useQuery(queryInput, {
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const { data: pipeline } = trpc.dashboard.pipeline.useQuery(queryInput, {
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const leadsFromMonitor = overview?.totalLeadsInPeriod ?? 0;
  const leadsFromSheet = pipeline?.source === "sheet" ? pipeline.funnel.leads : 0;
  // Total combinado: monitor + planilha (sem deduplicar — futuro: match por telefone)
  const leadsInPeriod = leadsFromMonitor + leadsFromSheet;
  const investmentTotal = investment?.source === "sheet" ? investment.total : 0;
  const cpl = leadsInPeriod > 0 && investmentTotal > 0 ? investmentTotal / leadsInPeriod : null;

  // Topo: ROAS quando há receita
  const revenueFromSheet = pipeline?.source === "sheet" ? pipeline.revenue : 0;
  const roas = investmentTotal > 0 && revenueFromSheet > 0 ? revenueFromSheet / investmentTotal : null;

  return (
    <div className="h-full overflow-y-auto bg-[#FAFAF7]">
      <div className="max-w-[1400px] mx-auto p-6 lg:p-10 pb-20">
        {/* ─── Faixa de período ─── */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3 px-4 py-3 rounded-2xl border border-[#11131F]/10 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#DFFF00]/30 flex items-center justify-center">
              <CalendarIcon className="w-4 h-4 text-[#11131F]" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Período em análise
              </p>
              <p className="text-sm font-semibold text-gray-900 tabular">
                {fmtDate(from, "dd 'de' MMM", { locale: ptBR })} →{" "}
                {fmtDate(to, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  · {days} {days === 1 ? "dia" : "dias"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Investimento</p>
              <p className="text-base font-bold text-[#11131F] tabular">
                {investment?.source === "sheet" ? fmtMoney(investmentTotal) : "—"}
              </p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Leads</p>
              <p className="text-base font-bold text-[#11131F] tabular">{fmtNum(leadsInPeriod)}</p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">CPL</p>
              <p className="text-base font-bold text-[#11131F] tabular">
                {cpl != null ? fmtMoney(cpl, 2) : "—"}
              </p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Receita</p>
              <p className="text-base font-bold text-[#11131F] tabular">
                {revenueFromSheet > 0 ? fmtMoney(revenueFromSheet) : "—"}
              </p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">ROAS</p>
              <p className="text-base font-bold text-[#11131F] tabular">
                {roas != null ? `${roas.toFixed(2)}x` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* ─── Seções reais ─── */}
        <Section
          index="01"
          title="Investimento (Planilha CUSTOS)"
          subtitle="Custos lançados na aba CUSTOS · alimenta CPL e CAC"
        >
          <InvestmentSection data={investment} leads={leadsInPeriod} />
        </Section>

        <Section
          index="02"
          title="Funil de Vendas (Planilha PIPELINE)"
          subtitle="Lead → Agendamento → Consulta → Cirurgia"
        >
          <FunnelSection data={pipeline} />
        </Section>

        <Section
          index="03"
          title="Financeiro (CUSTOS × PIPELINE)"
          subtitle="Receita, ticket, CAC, ROAS e performance por hospital/canal"
        >
          <FinancialSection investment={investment} pipeline={pipeline} />
        </Section>

        <Section
          index="04"
          title="Procedimentos & Perdas (PIPELINE)"
          subtitle="Performance por procedimento e principais motivos de perda"
        >
          <LossesSection pipeline={pipeline} />
        </Section>

        <Section
          index="05"
          title="Volume de Leads (Monitor)"
          subtitle="Contatos do waboxapp criados no período"
        >
          <LeadsSection overview={overview} />
        </Section>

        <Section
          index="06"
          title="Qualidade do Atendimento (Monitor)"
          subtitle="Velocidade de resposta e validade da base"
        >
          <QualitySection overview={overview} />
        </Section>

        <Section
          index="07"
          title="Infraestrutura (Monitor)"
          subtitle="Status dos canais WhatsApp e volume bruto"
        >
          <InfraSection overview={overview} />
        </Section>

        <div className="mt-16 text-center">
          <p className="text-[11px] text-gray-400">
            Dashboard 100% real · fontes: abas CUSTOS + PIPELINE da planilha + banco do monitor · Sougni 2026
          </p>
        </div>
      </div>
    </div>
  );
}
