import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSSE } from "@/hooks/useSSE";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  MessageSquare,
  Users,
  Wifi,
  WifiOff,
  BatteryLow,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  Activity,
  Radio,
  Clock,
  Flame,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function timeAgo(date: Date | string | null | undefined) {
  if (!date) return "—";
  try {
    return formatDistanceToNow(new Date(date), { locale: ptBR, addSuffix: true });
  } catch {
    return "—";
  }
}

function msgTypeLabel(type: string) {
  const map: Record<string, string> = {
    chat: "Texto",
    image: "Imagem",
    video: "Vídeo",
    audio: "Áudio",
    ptt: "Áudio",
    document: "Doc",
    vcard: "Contato",
    location: "Local",
    unknown: "?",
  };
  return map[type] ?? type;
}

// ─── Pulse Dot ────────────────────────────────────────────────────────────────

function PulseDot({ color = "bg-emerald-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  );
}

// ─── Velocity Bar ─────────────────────────────────────────────────────────────

function VelocityBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}

// ─── Feed Item ────────────────────────────────────────────────────────────────

interface FeedItemProps {
  id: number;
  direction: string;
  type: string;
  text: string | null;
  createdAt: Date | string;
  contactName: string;
  instanceAlias: string;
}

function FeedItem({ direction, type, text, createdAt, contactName, instanceAlias }: FeedItemProps) {
  const isIn = direction === "in";
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0"
    >
      <div className={`mt-0.5 p-1 rounded-lg shrink-0 ${isIn ? "bg-blue-50" : "bg-gray-50"}`}>
        {isIn
          ? <ArrowDownLeft className="h-3 w-3 text-blue-500" />
          : <ArrowUpRight className="h-3 w-3 text-gray-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-800 truncate max-w-[120px]">{contactName}</span>
          <span className="text-[10px] text-gray-300">·</span>
          <span className="text-[10px] text-gray-400 truncate">{instanceAlias}</span>
        </div>
        <p className="text-[11px] text-gray-500 truncate mt-0.5">
          {type !== "chat" ? (
            <span className="inline-flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-medium text-gray-500">{msgTypeLabel(type)}</span>
            </span>
          ) : (
            text ?? "—"
          )}
        </p>
      </div>
      <span className="text-[10px] text-gray-300 shrink-0 mt-0.5">{timeAgo(createdAt)}</span>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RealtimePulseCard() {
  const [tick, setTick] = useState(0);
  const prevMsgs1min = useRef(0);
  const [flashCount, setFlashCount] = useState(0);

  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  // Polling a cada 10 segundos para dados ao vivo
  const { data, dataUpdatedAt } = trpc.dashboard.realtime.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  // Invalidação imediata via SSE quando chega nova mensagem
  const handleNewMessage = useCallback(() => {
    utils.dashboard.realtime.invalidate();
  }, [utils]);

  useSSE({
    userId: user?.id ?? 0,
    enabled: !authLoading && !!user?.id,
    onEvent: {
      new_message: handleNewMessage,
      dashboard_refresh: handleNewMessage,
    },
  });

  // Ticker de segundos para o "ao vivo"
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Flash quando chega nova mensagem no último minuto
  useEffect(() => {
    if (!data) return;
    if (data.msgsLast1min > prevMsgs1min.current) {
      setFlashCount((c) => c + 1);
    }
    prevMsgs1min.current = data.msgsLast1min;
  }, [data?.msgsLast1min]);

  const maxMsgs = Math.max(data?.msgsLast1h ?? 0, 1);
  const onlineCount = data?.onlineCount ?? 0;
  const totalInstances = data?.totalInstances ?? 0;
  const allOnline = onlineCount === totalInstances && totalInstances > 0;

  return (
    <Card className="border border-gray-100 bg-white overflow-hidden">
      <CardHeader className="pb-0 pt-5 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Radio className="h-4 w-4 text-gray-700" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            </div>
            <CardTitle className="text-sm font-semibold text-gray-700">Pulso em Tempo Real</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <PulseDot />
            <span className="text-[10px] text-gray-400">ao vivo</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-4 space-y-4">

        {/* ── Velocidade de Mensagens ──────────────────────────────────── */}
        <div className="space-y-2.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <Zap className="h-3 w-3" />
            Velocidade de Mensagens
          </p>

          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "1 min", value: data?.msgsLast1min ?? 0, color: "bg-violet-500", textColor: "text-violet-600" },
              { label: "5 min", value: data?.msgsLast5min ?? 0, color: "bg-blue-500", textColor: "text-blue-600" },
              { label: "15 min", value: data?.msgsLast15min ?? 0, color: "bg-sky-500", textColor: "text-sky-600" },
              { label: "1 hora", value: data?.msgsLast1h ?? 0, color: "bg-indigo-500", textColor: "text-indigo-600" },
            ].map(({ label, value, color, textColor }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={value}
                    initial={{ scale: 1.2, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-xl font-bold ${textColor} leading-none`}
                  >
                    {fmt(value)}
                  </motion.p>
                </AnimatePresence>
                <p className="text-[10px] text-gray-400 mt-1">{label}</p>
                <div className="mt-1.5">
                  <VelocityBar value={value} max={maxMsgs} color={color} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Direção (in/out) ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2.5 bg-blue-50 rounded-xl px-3 py-2.5">
            <ArrowDownLeft className="h-4 w-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-base font-bold text-blue-700 leading-none">{fmt(data?.msgsIn1h ?? 0)}</p>
              <p className="text-[10px] text-blue-400 mt-0.5">Recebidas / 1h</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
            <ArrowUpRight className="h-4 w-4 text-gray-500 shrink-0" />
            <div>
              <p className="text-base font-bold text-gray-700 leading-none">{fmt(data?.msgsOut1h ?? 0)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Enviadas / 1h</p>
            </div>
          </div>
        </div>

        {/* ── Leads ao Vivo ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2.5 bg-emerald-50 rounded-xl px-3 py-2.5">
            <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
            <div>
              <p className="text-base font-bold text-emerald-700 leading-none">{fmt(data?.leadsLast1h ?? 0)}</p>
              <p className="text-[10px] text-emerald-500 mt-0.5">Leads / 1h</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-emerald-50/60 rounded-xl px-3 py-2.5">
            <Users className="h-4 w-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-base font-bold text-emerald-700 leading-none">{fmt(data?.leadsToday ?? 0)}</p>
              <p className="text-[10px] text-emerald-500 mt-0.5">Leads hoje</p>
            </div>
          </div>
        </div>

        {/* ── Status das Instâncias ────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            Instâncias
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data?.instancesStatus?.map((inst) => {
              const isOnline = inst.status === "online";
              const battLow = inst.battery !== null && inst.battery !== undefined && inst.battery < 20;
              return (
                <div
                  key={inst.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                    isOnline
                      ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                      : "bg-red-50 border-red-100 text-red-600"
                  }`}
                >
                  {isOnline
                    ? <Wifi className="h-3 w-3 shrink-0" />
                    : <WifiOff className="h-3 w-3 shrink-0" />}
                  <span className="truncate max-w-[80px]">{inst.alias}</span>
                  {inst.battery !== null && inst.battery !== undefined && (
                    <span className={`text-[10px] ${battLow ? "text-red-500 font-bold" : "text-gray-400"}`}>
                      {battLow && <BatteryLow className="inline h-2.5 w-2.5 mr-0.5" />}
                      {inst.battery}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {data?.lowBatteryInstances && data.lowBatteryInstances.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-100 rounded-lg">
              <BatteryLow className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-[11px] text-amber-700 font-medium">
                Bateria baixa: {data.lowBatteryInstances.map((i) => `${i.alias} (${i.battery}%)`).join(", ")}
              </span>
            </div>
          )}
        </div>

        {/* ── Última Mensagem + Contato Mais Ativo ─────────────────────── */}
        <div className="grid grid-cols-1 gap-2">
          {data?.lastMessage && (
            <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
              <Clock className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Última mensagem recebida</p>
                <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">
                  {data.lastMessage.contactName ?? "Desconhecido"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-gray-400">{data.lastMessage.instanceAlias}</span>
                  <span className="text-[10px] text-gray-300">·</span>
                  <span className="text-[10px] text-gray-400">{timeAgo(data.lastMessage.createdAt)}</span>
                  <span className="text-[10px] text-gray-300">·</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded text-gray-500 font-medium">{msgTypeLabel(data.lastMessage.type)}</span>
                </div>
              </div>
            </div>
          )}

          {data?.topContact && (
            <div className="flex items-start gap-2.5 bg-amber-50 rounded-xl px-3 py-2.5">
              <Flame className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-amber-500 font-medium uppercase tracking-wide">Contato mais ativo (24h)</p>
                <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{data.topContact.name}</p>
                <p className="text-[11px] text-amber-600 mt-0.5">{fmt(data.topContact.msgCount)} mensagens</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Feed de Eventos Recentes ─────────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3" />
            Feed Recente (24h)
          </p>
          <div className="max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-100 pr-0.5">
            {!data?.recentFeed?.length ? (
              <div className="py-4 text-center">
                <p className="text-xs text-gray-300">Nenhuma mensagem recente</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {data.recentFeed.map((item) => (
                  <FeedItem key={item.id} {...item} />
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* ── Rodapé ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-50">
          <span className="text-[10px] text-gray-300 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Atualiza a cada 10s
          </span>
          {dataUpdatedAt && (
            <span className="text-[10px] text-gray-300">
              {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
