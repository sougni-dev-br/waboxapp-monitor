/**
 * Centro de Operação — visão completa pra gestor de operações.
 *
 * Métricas (todas vindas do que Wabox fornece via msgs in/out):
 * - TMA (Tempo Médio de Atendimento): duração média da conversa
 * - TME (Tempo Médio de Espera / 1ª resposta): first_out - first_in
 * - SLA %: atendidos em ≤5 min
 * - Fila de espera: contatos com último msg=in sem resposta
 * - Performance por operadora (instância): msgs in/out, contatos, response rate
 * - Distribuição por tipo de mensagem
 * - Volume horário in/out
 * - Volume por dia da semana
 */
import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneUid } from "@/lib/formatPhone";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSSE } from "@/hooks/useSSE";
import {
  Headphones,
  Timer,
  Clock,
  Zap,
  Users,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Inbox,
  Activity,
  Wifi,
  WifiOff,
  Image as ImageIcon,
  Mic,
  MapPin,
  FileText,
  Video,
  Phone,
  HelpCircle,
  BarChart3,
  Smartphone,
  Hourglass,
  CalendarIcon,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
  Line,
  LineChart,
  Legend,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

function fmtDuration(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 60) return `${min.toFixed(1).replace(".", ",")} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${Math.round(diffMin)} min`;
  const diffH = diffMin / 60;
  if (diffH < 24) return `há ${Math.round(diffH)}h`;
  const diffD = diffH / 24;
  if (diffD < 7) return `há ${Math.round(diffD)}d`;
  return format(d, "dd/MM HH:mm");
}

const toISODate = (d: Date) => format(d, "yyyy-MM-dd");

// ─── Section Title ────────────────────────────────────────────────────────────

function SectionTitle({ index, title, subtitle, action }: { index: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-4 mt-12 first:mt-2">
      <div>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-[10px] font-medium text-gray-400 tracking-[0.2em]">{index}</span>
          <div className="h-px w-12 bg-gray-200" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-gray-900 leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── DateRangePicker ──────────────────────────────────────────────────────────

function DatePicker({ dateRange, onSelect, onClear }: {
  dateRange: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => {
    if (!dateRange?.from) return "Período: 30 dias";
    if (!dateRange.to) return format(dateRange.from, "dd/MM/yyyy");
    return `${format(dateRange.from, "dd/MM")} → ${format(dateRange.to, "dd/MM/yyyy")}`;
  }, [dateRange]);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
            dateRange?.from ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
          }`}>
            <CalendarIcon className="h-3.5 w-3.5" />
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 shadow-xl border border-gray-100 rounded-2xl" align="end">
          <div className="flex items-center gap-1.5 px-4 pt-3">
            {[
              { label: "Hoje", days: 0 },
              { label: "7d", days: 7 },
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
            ].map(({ label: l, days }) => (
              <button key={l}
                onClick={() => {
                  onSelect({ from: startOfDay(subDays(new Date(), days)), to: endOfDay(new Date()) });
                  setOpen(false);
                }}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100"
              >
                {l}
              </button>
            ))}
          </div>
          <Calendar mode="range" selected={dateRange} onSelect={(r) => { onSelect(r); if (r?.from && r?.to) setTimeout(() => setOpen(false), 150); }}
            locale={ptBR} disabled={{ after: new Date() }} numberOfMonths={2} className="p-3" />
        </PopoverContent>
      </Popover>
      {dateRange?.from && (
        <button onClick={onClear} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg" title="Limpar">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Delta indicator ──────────────────────────────────────────────────────────

function Delta({ value, invertColor = false }: { value: number; invertColor?: boolean }) {
  if (value === 0) return null;
  const isPositive = value >= 0;
  const isGood = invertColor ? !isPositive : isPositive;
  const color = isGood ? "text-emerald-600 bg-emerald-50" : "text-red-500 bg-red-50";
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${color}`}>
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(value)}%
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  label, value, icon: Icon, iconBg, iconColor, hint, badge, delta, invertDelta,
}: {
  label: string; value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string; iconColor: string;
  hint?: string; badge?: string;
  delta?: number; invertDelta?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-gray-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        {badge && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-500">{badge}</span>
        )}
        {delta !== undefined && <Delta value={delta} invertColor={invertDelta} />}
      </div>
      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>}
    </motion.div>
  );
}

// ─── Icon de tipo de mensagem ────────────────────────────────────────────────

const TYPE_LABEL: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  chat:     { label: "Texto",       icon: MessageSquare, color: "#11131F" },
  image:    { label: "Imagem",      icon: ImageIcon,     color: "#3B82F6" },
  video:    { label: "Vídeo",       icon: Video,         color: "#8B5CF6" },
  audio:    { label: "Áudio",       icon: Mic,           color: "#F59E0B" },
  ptt:      { label: "Voz (PTT)",   icon: Mic,           color: "#F97316" },
  document: { label: "Documento",   icon: FileText,      color: "#10B981" },
  vcard:    { label: "Contato",     icon: Phone,         color: "#EC4899" },
  location: { label: "Localização", icon: MapPin,        color: "#06B6D4" },
  unknown:  { label: "Outro",       icon: HelpCircle,    color: "#9CA3AF" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function OperationCenter() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const lastInvalidateRef = useRef(0);
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const dateFromStr = dateRange?.from ? toISODate(dateRange.from) : undefined;
  const dateToStr = dateRange?.to ? toISODate(dateRange.to) : undefined;

  const queryInput = useMemo(() => {
    if (!dateFromStr && !dateToStr) return undefined;
    return { dateFrom: dateFromStr, dateTo: dateToStr };
  }, [dateFromStr, dateToStr]);

  const { data, isLoading, refetch } = trpc.dashboard.operation.useQuery(queryInput, {
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 15_000,
  });

  // SSE: refetch on new message (debounce 1s)
  useSSE({
    userId: user?.id ?? 0,
    enabled: !authLoading && !!user?.id,
    onEvent: {
      new_message: () => {
        const now = Date.now();
        if (now - lastInvalidateRef.current < 1000) return;
        lastInvalidateRef.current = now;
        utils.dashboard.operation.invalidate();
      },
    },
  });

  const periodLabel = useMemo(() => {
    if (!dateRange?.from) return "Últimos 30 dias";
    if (!dateRange.to) return `A partir de ${format(dateRange.from, "dd/MM")}`;
    return `${format(dateRange.from, "dd/MM")} – ${format(dateRange.to, "dd/MM/yyyy")}`;
  }, [dateRange]);

  if (isLoading || !data) {
    return (
      <div className="h-full overflow-y-auto bg-[#FAFAF7]">
        <div className="max-w-[1400px] mx-auto p-6 lg:p-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-gray-100 animate-pulse" />
            <div>
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mb-2" />
              <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 h-28 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { kpis, queue, operators, messageTypes, hourlyVolume, dowVolume } = data;
  const totalAtivos = kpis.conversasAbertas;
  const responseRatePct = kpis.totalAtendimentos > 0
    ? Math.round((kpis.conversasResolvidas / kpis.totalAtendimentos) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto bg-[#FAFAF7]">
      <div className="max-w-[1400px] mx-auto p-6 lg:p-10 pb-20">

        {/* ─── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "#11131F" }}>
                <Headphones className="h-5 w-5 text-[#DFFF00]" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-semibold">Centro de Atendimento</p>
              <h1 className="text-2xl font-semibold text-gray-900 leading-tight">Operação</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Período</p>
              <p className="text-xs text-gray-700 font-medium">{periodLabel}</p>
            </div>
            <DatePicker dateRange={dateRange} onSelect={setDateRange} onClear={() => setDateRange(undefined)} />
          </div>
        </div>

        {/* ─── Status hero ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-[#11131F] to-[#1f2238] rounded-2xl p-5 text-white relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl bg-[#DFFF00]" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/50 font-medium mb-1">Aguardando resposta</p>
                <p className="text-3xl font-bold tabular-nums">{fmtNum(queue.length)}</p>
                <p className="text-[11px] text-white/60 mt-1">contatos na fila</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#DFFF00]/20 flex items-center justify-center">
                <Inbox className="h-5 w-5 text-[#DFFF00]" />
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">Conversas em andamento</p>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{fmtNum(totalAtivos)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-gray-500">{fmtNum(kpis.conversasResolvidas)} resolvidas</span>
                  <span className="text-[11px] text-gray-300">·</span>
                  <span className="text-[11px] text-gray-500">{fmtNum(kpis.conversasInativas)} inativas</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">Taxa de resolução</p>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{responseRatePct}%</p>
                <p className="text-[11px] text-gray-500 mt-1">do total de atendimentos</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* ─── 01 · KPIs de Tempo ──────────────────────────────────── */}
        <SectionTitle index="01" title="Tempos e SLA" subtitle="Velocidade de resposta da operação" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard label="TME · Tempo de espera" value={fmtDuration(kpis.tmeMinutes)}
            icon={Hourglass} iconBg="bg-amber-50" iconColor="text-amber-600"
            hint="1ª resposta após contato inicial" />
          <KPICard label="TMA · Tempo de atendimento" value={fmtDuration(kpis.tmaMinutes)}
            icon={Timer} iconBg="bg-violet-50" iconColor="text-violet-600"
            hint="Duração média da conversa" />
          <KPICard label="SLA · Atendidos em ≤5min" value={`${kpis.slaPercent}%`}
            icon={Zap} iconBg="bg-blue-50" iconColor="text-blue-600"
            hint="Meta operacional: 90%" />
          <KPICard label="Atendimentos totais" value={fmtNum(kpis.totalAtendimentos)}
            icon={Users} iconBg="bg-emerald-50" iconColor="text-emerald-600"
            hint={`${fmtNum(kpis.totalMessagesIn + kpis.totalMessagesOut)} mensagens trocadas`} />
        </div>

        {/* ─── 02 · Fila de Espera ─────────────────────────────────── */}
        <SectionTitle index="02" title="Fila de Espera"
          subtitle={`${queue.length} contatos aguardando — ordenado por tempo`}
          action={
            <button onClick={() => refetch()}
              className="text-[11px] text-gray-500 hover:text-gray-900 underline underline-offset-4">
              Atualizar agora
            </button>
          } />
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {queue.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">Fila zerada</p>
              <p className="text-xs text-gray-500 mt-1">Todos os contatos foram respondidos</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {queue.slice(0, 10).map((q, i) => {
                const isUrgent = q.waitMinutes > 30;
                const isVeryUrgent = q.waitMinutes > 120;
                return (
                  <motion.div
                    key={q.contactId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.03 * i, duration: 0.3 }}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors group"
                  >
                    <div className={`w-2 h-2 rounded-full ${isVeryUrgent ? "bg-red-500 animate-pulse" : isUrgent ? "bg-amber-500" : "bg-emerald-400"}`} />
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                      {(q.contactName ?? q.contactUid).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{q.contactName ?? formatPhoneUid(q.contactUid)}</p>
                        <span className="text-[10px] text-gray-400">·</span>
                        <p className="text-[11px] text-gray-500 truncate">{q.instanceAlias ?? "—"}</p>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{q.lastMessageText}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${isVeryUrgent ? "text-red-600" : isUrgent ? "text-amber-600" : "text-gray-900"}`}>
                        {fmtDuration(q.waitMinutes)}
                      </p>
                      <p className="text-[10px] text-gray-400">{q.inboundCount} msg{q.inboundCount > 1 ? "s" : ""}</p>
                    </div>
                  </motion.div>
                );
              })}
              {queue.length > 10 && (
                <div className="px-5 py-3 bg-gray-50/30 text-center">
                  <p className="text-[11px] text-gray-500">+ {queue.length - 10} contatos na fila</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── 03 · Performance por Operadora ──────────────────────── */}
        <SectionTitle index="03" title="Performance por Operadora"
          subtitle="Cada instância WhatsApp = um canal de atendimento" />
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-gray-50 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
            <div className="col-span-3">Operadora</div>
            <div className="col-span-1 text-right">Status</div>
            <div className="col-span-1 text-right">Contatos</div>
            <div className="col-span-1 text-right">Msg In</div>
            <div className="col-span-1 text-right">Msg Out</div>
            <div className="col-span-1 text-right">Resp.</div>
            <div className="col-span-1 text-right">TME</div>
            <div className="col-span-1 text-right">TMA</div>
            <div className="col-span-2 text-right">Resolvidas</div>
          </div>
          <div className="divide-y divide-gray-50">
            {operators.map((op, i) => {
              const isOnline = op.status === "online";
              return (
                <motion.div
                  key={op.instanceId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.03 * i }}
                  className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-gray-50/40 transition-colors"
                >
                  <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${i === 0 ? "bg-[#DFFF00]/30" : "bg-gray-100"}`}>
                      <Smartphone className="h-3.5 w-3.5 text-gray-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{op.alias}</p>
                      <p className="text-[10px] text-gray-400 truncate">{formatPhoneUid(op.uid)}</p>
                    </div>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${isOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {isOnline ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                      {isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="col-span-1 text-right">
                    <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtNum(op.uniqueContacts)}</p>
                  </div>
                  <div className="col-span-1 text-right text-sm text-gray-700 tabular-nums">{fmtNum(op.messagesIn)}</div>
                  <div className="col-span-1 text-right text-sm text-gray-700 tabular-nums">{fmtNum(op.messagesOut)}</div>
                  <div className="col-span-1 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${op.responseRate >= 80 ? "bg-emerald-500" : op.responseRate >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${op.responseRate}%` }} />
                      </div>
                      <span className="text-[11px] text-gray-600 font-medium tabular-nums w-8 text-right">{op.responseRate}%</span>
                    </div>
                  </div>
                  <div className="col-span-1 text-right text-xs text-gray-700 tabular-nums">{fmtDuration(op.avgResponseMin)}</div>
                  <div className="col-span-1 text-right text-xs text-gray-700 tabular-nums">{fmtDuration(op.avgConversationMin)}</div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtNum(op.resolvedConversations)}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ─── 04 · Volume de mensagens (in vs out) ────────────────── */}
        <SectionTitle index="04" title="Volume de mensagens"
          subtitle="Comparativo de entradas vs saídas por hora" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-gray-400" />
                <p className="text-sm font-semibold text-gray-700">Distribuição horária</p>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#3B82F6]" /> Recebidas</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#DFFF00]" /> Enviadas</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={hourlyVolume} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="hour" stroke="#D1D5DB" tick={{ fill: "#9CA3AF", fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(h) => `${h.toString().padStart(2, "0")}h`} interval={2} />
                <YAxis stroke="#D1D5DB" tick={{ fill: "#9CA3AF", fontSize: 10 }} tickLine={false} axisLine={false} />
                <RTooltip cursor={{ fill: "#F9FAFB" }}
                  formatter={(v: number, name: string) => [fmtNum(v), name === "in" ? "Recebidas" : "Enviadas"]}
                  labelFormatter={(h) => `${h.toString().padStart(2, "0")}h00`}
                  contentStyle={{ borderRadius: 12, border: "1px solid #F3F4F6", fontSize: 12 }} />
                <Bar dataKey="in" fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="out" fill="#DFFF00" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Dia da semana */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-gray-400" />
              <p className="text-sm font-semibold text-gray-700">Por dia da semana</p>
            </div>
            <div className="space-y-2.5">
              {dowVolume.map((d, i) => {
                const max = Math.max(...dowVolume.map((x) => x.total), 1);
                const pct = (d.total / max) * 100;
                return (
                  <motion.div key={d.dow} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs text-gray-700 font-medium">{d.label}</span>
                      <span className="text-xs text-gray-900 font-semibold tabular-nums">{fmtNum(d.total)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.1 + 0.05 * i, duration: 0.6 }}
                        className="h-full rounded-full"
                        style={{ background: d.total === max ? "linear-gradient(90deg, #DFFF00, #b3cc00)" : "#11131F" }} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── 05 · Tipos de mensagem ──────────────────────────────── */}
        <SectionTitle index="05" title="Tipos de mensagem"
          subtitle="Distribuição do volume por categoria de conteúdo" />
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          {messageTypes.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Sem mensagens no período</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {messageTypes.map((mt, i) => {
                const meta = TYPE_LABEL[mt.type] ?? TYPE_LABEL.unknown;
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={mt.type}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.04 * i }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/60 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${meta.color}15`, color: meta.color }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">{meta.label}</p>
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-lg font-bold text-gray-900 tabular-nums">{fmtNum(mt.count)}</p>
                        <p className="text-xs text-gray-500 font-medium">{mt.pct}%</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-12 text-center">
          <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Atualizado a cada 30 segundos · Eventos em tempo real via SSE
          </p>
        </div>
      </div>
    </div>
  );
}
