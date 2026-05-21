import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSSE } from "@/hooks/useSSE";
import { useAuth } from "@/_core/hooks/useAuth";
import { format, parseISO, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import type { DateRange } from "react-day-picker";
import {
  Users,
  MessageSquare,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  Activity,
  RefreshCw,
  BarChart2,
  Tag,
  CalendarIcon,
  X,
} from "lucide-react";
import { RealtimePulseCard } from "@/components/RealtimePulseCard";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatNumber = (num: number): string =>
  new Intl.NumberFormat("pt-BR").format(num);

const formatPercent = (num: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(num / 100);

const calculateVariation = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const toISODate = (d: Date) => format(d, "yyyy-MM-dd");

// ─── Skeletons ────────────────────────────────────────────────────────────────

function KPISkeleton() {
  return (
    <Card className="border border-gray-100 bg-white">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <Card className="border border-gray-100 bg-white">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-44" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded-lg" style={{ height }} />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card className="border border-gray-100 bg-white">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-44" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: number;
  variation?: number;
  variationLabel?: string;
  icon: React.ReactNode;
  iconBg?: string;
  suffix?: string;
  delay?: number;
}

function KPICard({ title, value, variation, variationLabel = "vs ontem", icon, iconBg = "bg-gray-50", suffix, delay = 0 }: KPICardProps) {
  const isPositive = variation !== undefined && variation >= 0;
  const hasVariation = variation !== undefined;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200 group">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">{title}</p>
              <p className="text-3xl font-bold text-gray-900 leading-none">
                {formatNumber(value)}
                {suffix && (
                  <span className="text-base font-normal text-gray-400 ml-0.5">{suffix}</span>
                )}
              </p>
              {hasVariation && (
                <div className={`flex items-center gap-1 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{isPositive ? "+" : ""}{variation!.toFixed(1)}%</span>
                  <span className="text-gray-400 font-normal">{variationLabel}</span>
                </div>
              )}
            </div>
            <div className={`p-2.5 ${iconBg} rounded-xl shrink-0 group-hover:scale-105 transition-transform`}>{icon}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}

function LineChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100 text-xs">
      <p className="font-semibold text-gray-700 mb-2">
        {label && format(parseISO(label), "dd 'de' MMM", { locale: ptBR })}
      </p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500">{entry.dataKey === "newContacts" ? "Leads" : "Msgs"}:</span>
          <span className="font-bold text-gray-900">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function HeatmapTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white p-2.5 rounded-xl shadow-lg border border-gray-100 text-xs">
      <p className="font-semibold text-gray-700">{label}</p>
      <p className="text-gray-500 mt-0.5">{formatNumber(payload[0].value)} mensagens</p>
    </div>
  );
}

// ─── DateRangePicker ──────────────────────────────────────────────────────────

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  onClear: () => void;
}

function DateRangePicker({ dateRange, onSelect, onClear }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const hasRange = dateRange?.from !== undefined;

  const label = useMemo(() => {
    if (!dateRange?.from) return "Selecionar período";
    if (!dateRange.to) return format(dateRange.from, "dd/MM/yyyy");
    return `${format(dateRange.from, "dd/MM/yyyy")} → ${format(dateRange.to, "dd/MM/yyyy")}`;
  }, [dateRange]);

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              hasRange
                ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900"
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[180px] truncate">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 shadow-xl border border-gray-100 rounded-2xl overflow-hidden"
          align="end"
          sideOffset={8}
        >
          {/* Header do calendário */}
          <div className="px-4 pt-4 pb-2 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-700">Selecionar período</p>
            {dateRange?.from && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                {dateRange.to
                  ? `${format(dateRange.from, "dd 'de' MMM", { locale: ptBR })} até ${format(dateRange.to, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}`
                  : `De ${format(dateRange.from, "dd 'de' MMM", { locale: ptBR })} — selecione o fim`}
              </p>
            )}
          </div>

          {/* Atalhos rápidos */}
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
            {[
              { label: "7d", days: 7 },
              { label: "14d", days: 14 },
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
            ].map(({ label: l, days }) => {
              const from = startOfDay(subDays(new Date(), days));
              const to = endOfDay(new Date());
              const isActive =
                dateRange?.from?.getTime() === from.getTime() &&
                dateRange?.to?.getTime() === to.getTime();
              return (
                <button
                  key={l}
                  onClick={() => {
                    onSelect({ from, to });
                    setOpen(false);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>

          {/* Calendário */}
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              onSelect(range);
              // Fecha automaticamente quando ambas as datas estão selecionadas
              if (range?.from && range?.to) {
                setTimeout(() => setOpen(false), 150);
              }
            }}
            locale={ptBR}
            disabled={{ after: new Date() }}
            numberOfMonths={2}
            className="p-3"
          />

          {/* Rodapé */}
          <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-gray-50">
            <button
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Limpar filtro
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1 text-[11px] font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Aplicar
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {hasRange && (
        <button
          onClick={onClear}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          title="Limpar período"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OperationalDash() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const lastDataUpdatedAt = useRef(0);

  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  // Debounce refs para evitar flood de invalidações simultâneas
  const lastInvalidateRef = useRef(0);
  const pendingInvalidateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Invalidar dashboard ao receber eventos SSE em tempo real (com debounce de 300ms)
  const handleSSERefresh = useCallback(() => {
    const now = Date.now();
    const timeSinceLast = now - lastInvalidateRef.current;

    if (timeSinceLast < 300) {
      if (!pendingInvalidateRef.current) {
        pendingInvalidateRef.current = setTimeout(() => {
          pendingInvalidateRef.current = null;
          lastInvalidateRef.current = Date.now();
          utils.dashboard.overview.invalidate();
          utils.dashboard.realtime.invalidate();
          setLastUpdate(new Date());
        }, 300 - timeSinceLast);
      }
      return;
    }

    lastInvalidateRef.current = now;
    utils.dashboard.overview.invalidate();
    utils.dashboard.realtime.invalidate();
    setLastUpdate(new Date());
  }, [utils]);

  // Cleanup do debounce
  useEffect(() => {
    return () => {
      if (pendingInvalidateRef.current) {
        clearTimeout(pendingInvalidateRef.current);
      }
    };
  }, []);

  // Só habilita SSE quando auth está carregado e usuário existe
  const sseEnabled = !authLoading && !!user?.id;

  useSSE({
    userId: user?.id ?? 0,
    enabled: sseEnabled,
    onEvent: {
      new_message: handleSSERefresh,
      dashboard_refresh: handleSSERefresh,
      instance_status_changed: handleSSERefresh,
      instance_status_update: handleSSERefresh,
    },
  });

  // Strings estáveis para evitar re-renders infinitos no React Query
  const dateFromStr = dateRange?.from ? toISODate(dateRange.from) : undefined;
  const dateToStr = dateRange?.to ? toISODate(dateRange.to) : undefined;

  // Converter DateRange para strings ISO para a query
  const queryInput = useMemo(() => {
    if (!dateFromStr && !dateToStr) return undefined;
    return { dateFrom: dateFromStr, dateTo: dateToStr };
  }, [dateFromStr, dateToStr]);

  const { data: overview, isLoading: overviewLoading, dataUpdatedAt } =
    trpc.dashboard.overview.useQuery(queryInput, {
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
      staleTime: 30_000, // Considera dados frescos por 30s para evitar race condition
    });

  useEffect(() => {
    if (dataUpdatedAt && dataUpdatedAt !== lastDataUpdatedAt.current) {
      lastDataUpdatedAt.current = dataUpdatedAt;
      setLastUpdate(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  const offlineInstances = useMemo(
    () => overview?.topInstances?.filter((i) => i.status === "offline") ?? [],
    [overview?.topInstances]
  );

  const sortedInstances = useMemo(() => {
    if (!overview?.topInstances) return [];
    return [...overview.topInstances].sort(
      (a, b) => (b.contactCount + b.messageCount) - (a.contactCount + a.messageCount)
    );
  }, [overview?.topInstances]);

  const totalLabels = useMemo(
    () => overview?.labelDistribution?.reduce((acc, l) => acc + l.count, 0) ?? 0,
    [overview?.labelDistribution]
  );

  const heatmapData = useMemo(() => {
    if (!overview?.hourlyHeatmap) return [];
    const maxCount = Math.max(...overview.hourlyHeatmap.map((h) => h.count), 1);
    return overview.hourlyHeatmap.map((h) => ({
      ...h,
      hourLabel: `${h.hour.toString().padStart(2, "0")}h`,
      intensity: h.count / maxCount,
    }));
  }, [overview?.hourlyHeatmap]);

  const getHeatmapColor = (intensity: number) => {
    if (intensity < 0.15) return "#F3F4F6";
    if (intensity < 0.35) return "#D1D5DB";
    if (intensity < 0.55) return "#9CA3AF";
    if (intensity < 0.75) return "#4B5563";
    return "#111827";
  };

  // Label do período ativo (DEVE ficar antes dos early returns)
  const periodLabel = useMemo(() => {
    if (!dateRange?.from) return "Últimos 30 dias";
    if (!dateRange.to) return `A partir de ${format(dateRange.from, "dd/MM/yyyy")}`;
    return `${format(dateRange.from, "dd/MM/yyyy")} – ${format(dateRange.to, "dd/MM/yyyy")}`;
  }, [dateRange]);

  // ─── Loading State ──────────────────────────────────────────────
  if (overviewLoading) {
    return (
      <div className="h-full overflow-y-auto bg-[#FAFAFA] p-6 space-y-5">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-9 w-52" />
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <KPISkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3"><ChartSkeleton height={280} /></div>
          <div className="lg:col-span-2"><ChartSkeleton height={280} /></div>
        </div>
        <ChartSkeleton height={180} />
        <TableSkeleton />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="h-full flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-400">Erro ao carregar dados</p>
        </div>
      </div>
    );
  }

  const leadsVariation = calculateVariation(overview.newContactsToday, overview.newContactsYesterday);
  const timeStr = lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="h-full overflow-y-auto bg-[#FAFAFA]">
      <div className="max-w-[1400px] mx-auto p-6 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-900 rounded-xl">
              <BarChart2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">Dashboard Operacional</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs text-gray-400">Ao vivo · Atualizado às {timeStr}</span>
              </div>
            </div>
          </div>

          {/* DateRangePicker */}
          <div className="flex items-center gap-2">
            {dateRange?.from && (
              <span className="text-xs text-gray-400 hidden sm:block">{periodLabel}</span>
            )}
            <DateRangePicker
              dateRange={dateRange}
              onSelect={setDateRange}
              onClear={() => setDateRange(undefined)}
            />
          </div>
        </motion.div>

        {/* ── Período ativo badge ─────────────────────────────────────────── */}
        {dateRange?.from && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-900/5 border border-gray-900/10 rounded-xl">
              <CalendarIcon className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span className="text-xs text-gray-600">
                Exibindo dados de <strong>{periodLabel}</strong>
              </span>
              <button
                onClick={() => setDateRange(undefined)}
                className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Offline Alert ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {offlineInstances.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 0 }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <div className="p-1.5 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">
                    {offlineInstances.length} instância{offlineInstances.length > 1 ? "s" : ""} offline
                  </p>
                  <p className="text-xs text-red-500 truncate">
                    {offlineInstances.map((i) => i.alias).join(" · ")}
                  </p>
                </div>
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KPICard
            title="Leads Hoje"
            value={overview.newContactsToday}
            variation={leadsVariation}
            icon={<Users className="h-5 w-5 text-gray-700" />}
            delay={0}
          />
          <KPICard
            title="Leads Esta Semana"
            value={overview.newContactsThisWeek}
            variationLabel="últimos 7d"
            icon={<TrendingUp className="h-5 w-5 text-gray-700" />}
            delay={0.05}
          />
          <KPICard
            title="Mensagens 24h"
            value={overview.messagesLast24h}
            icon={<MessageSquare className="h-5 w-5 text-gray-700" />}
            delay={0.1}
          />
          <KPICard
            title="Instâncias Online"
            value={overview.instancesOnline}
            suffix={`/${overview.instancesTotal}`}
            iconBg={overview.instancesOnline === overview.instancesTotal ? "bg-emerald-50" : "bg-red-50"}
            icon={
              overview.instancesOnline === overview.instancesTotal
                ? <Wifi className="h-5 w-5 text-emerald-600" />
                : <WifiOff className="h-5 w-5 text-red-500" />
            }
            delay={0.15}
          />
        </div>

        {/* ── Realtime Pulse ───────────────────────────────────────────────── */}
        <RealtimePulseCard />

        {/* ── Charts Row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Gráfico de Leads */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-3"
          >
            <Card className="border border-gray-100 bg-white h-full">
              <CardHeader className="pb-1 pt-5 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-gray-400" />
                    <CardTitle className="text-sm font-semibold text-gray-700">Novos Leads por Dia</CardTitle>
                  </div>
                  <span className="text-[10px] text-gray-400">{periodLabel}</span>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {overview.dailySeries.length === 0 ? (
                  <div className="h-[260px] flex flex-col items-center justify-center gap-2">
                    <TrendingUp className="h-7 w-7 text-gray-200" />
                    <p className="text-xs text-gray-400">Nenhum dado no período</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={overview.dailySeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#111827" stopOpacity={0.12} />
                          <stop offset="100%" stopColor="#111827" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => format(parseISO(d), "dd/MM")}
                        stroke="#D1D5DB"
                        tick={{ fill: "#9CA3AF", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#D1D5DB"
                        tick={{ fill: "#9CA3AF", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<LineChartTooltip />} cursor={{ stroke: "#E5E7EB", strokeWidth: 1 }} />
                      <Area
                        type="monotone"
                        dataKey="newContacts"
                        stroke="#111827"
                        strokeWidth={2}
                        fill="url(#gradLeads)"
                        dot={false}
                        activeDot={{ r: 4, fill: "#111827", strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Gráfico de Etiquetas */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="lg:col-span-2"
          >
            <Card className="border border-gray-100 bg-white h-full">
              <CardHeader className="pb-1 pt-5 px-5">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-gray-400" />
                  <CardTitle className="text-sm font-semibold text-gray-700">Leads por Etiqueta</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {!overview.labelDistribution?.length ? (
                  <div className="h-[260px] flex flex-col items-center justify-center gap-2">
                    <Tag className="h-7 w-7 text-gray-200" />
                    <p className="text-xs text-gray-400">Nenhuma etiqueta criada</p>
                  </div>
                ) : (
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={overview.labelDistribution}
                          cx="42%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={95}
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="labelName"
                          strokeWidth={0}
                        >
                          {overview.labelDistribution.map((entry, i) => (
                            <Cell key={i} fill={entry.labelColor} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => [formatNumber(v), "Leads"]}
                          contentStyle={{ borderRadius: 12, border: "1px solid #F3F4F6", fontSize: 12 }}
                        />
                        <Legend
                          layout="vertical"
                          align="right"
                          verticalAlign="middle"
                          iconType="circle"
                          iconSize={8}
                          formatter={(v) => <span className="text-xs text-gray-600">{v}</span>}
                        />
                        <text x="42%" y="50%" textAnchor="middle" dominantBaseline="middle">
                          <tspan x="42%" dy="-8" fontSize="22" fontWeight="700" fill="#111827">{formatNumber(totalLabels)}</tspan>
                          <tspan x="42%" dy="20" fontSize="10" fill="#9CA3AF">leads</tspan>
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Heatmap de Horários ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border border-gray-100 bg-white">
            <CardHeader className="pb-1 pt-5 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <CardTitle className="text-sm font-semibold text-gray-700">Horários de Pico</CardTitle>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400">Menos</span>
                  {[0.1, 0.3, 0.55, 0.75, 0.95].map((v, i) => (
                    <div key={i} className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: getHeatmapColor(v) }} />
                  ))}
                  <span className="text-[10px] text-gray-400">Mais</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={heatmapData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis
                    dataKey="hourLabel"
                    stroke="#D1D5DB"
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    stroke="#D1D5DB"
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<HeatmapTooltip />} cursor={{ fill: "#F9FAFB" }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={28}>
                    {heatmapData.map((entry, i) => (
                      <Cell key={i} fill={getHeatmapColor(entry.intensity)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Tabela de Instâncias ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card className="border border-gray-100 bg-white">
            <CardHeader className="pb-1 pt-5 px-5">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-400" />
                <CardTitle className="text-sm font-semibold text-gray-700">Performance por Instância</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {sortedInstances.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-gray-400">Nenhuma instância cadastrada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-50 hover:bg-transparent">
                      <TableHead className="text-xs text-gray-400 font-medium pl-0">Instância</TableHead>
                      <TableHead className="text-xs text-gray-400 font-medium">Status</TableHead>
                      <TableHead className="text-xs text-gray-400 font-medium text-right">Uptime</TableHead>
                      <TableHead className="text-xs text-gray-400 font-medium text-right">Leads</TableHead>
                      <TableHead className="text-xs text-gray-400 font-medium text-right pr-0">Mensagens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedInstances.map((inst) => {
                      const uptimeInfo = overview.instanceUptime?.find((u) => u.instanceId === inst.instanceId);
                      const isOnline = inst.status === "online";
                      return (
                        <TableRow key={inst.instanceId} className="border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <TableCell className="pl-0">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? "bg-emerald-500" : "bg-red-400"}`} />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{inst.alias}</p>
                                <p className="text-[10px] text-gray-400">{inst.uid}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              isOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                            }`}>
                              {isOnline ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                              {isOnline ? "Online" : "Offline"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {uptimeInfo ? (
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${uptimeInfo.uptimePercent >= 90 ? "bg-emerald-500" : uptimeInfo.uptimePercent >= 70 ? "bg-amber-400" : "bg-red-400"}`}
                                    style={{ width: `${uptimeInfo.uptimePercent}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-600 font-medium w-10 text-right">{formatPercent(uptimeInfo.uptimePercent)}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-gray-700">
                            {formatNumber(inst.contactCount)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-gray-700 pr-0">
                            {formatNumber(inst.messageCount)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Rodapé ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 pb-2 text-[10px] text-gray-300">
          <RefreshCw className="h-3 w-3" />
          <span>Atualização automática a cada 60 segundos</span>
        </div>

      </div>
    </div>
  );
}
