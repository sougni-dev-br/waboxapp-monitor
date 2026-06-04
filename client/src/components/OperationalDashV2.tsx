/**
 * Dashboard Executivo Sougni — V2
 *
 * 9 sessões organizadas em blocos visuais distintos:
 * 0. Hero · Indicadores Prioritários
 * 1. Funil da Operação
 * 2. Indicadores de Mídia
 * 3. Qualidade do Lead
 * 4. Indicadores SDR
 * 5. Conversão do Funil
 * 6. Indicadores Financeiros
 * 7. Análise por Canal
 * 8. Estrutura Técnica
 *
 * Dados mockados — depois plugados ao backend.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Wallet,
  MousePointerClick,
  DollarSign,
  Target,
  Users,
  UserCheck,
  UserX,
  CalendarCheck,
  CalendarDays,
  Stethoscope,
  Megaphone,
  MapPin,
  Image as ImageIcon,
  Zap,
  Timer,
  Award,
  TrendingDown,
  Database,
  MessageCircle,
  BarChart3,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK = {
  priority: {
    timeToContact: { value: 3.2, unit: "min", delta: -18 },
    schedulingRate: { value: 48.1, unit: "%", delta: 12 },
    surgeryConversion: { value: 7.1, unit: "%", delta: 5 },
    cacPerSurgery: { value: 982, unit: "R$", delta: -8 },
  },
  funnel: [
    { stage: "Lead gerado", count: 1247, color: "#DFFF00" },
    { stage: "Lead contatado", count: 856, color: "#A8E5FF" },
    { stage: "Consulta agendada", count: 412, color: "#FFB876" },
    { stage: "Consulta realizada", count: 287, color: "#FF9C9C" },
    { stage: "Cirurgia realizada", count: 89, color: "#11131F" },
  ],
  media: {
    totalInvestment: 87450,
    ctr: 8.4,
    cpc: 5.92,
    cpl: 70.13,
    perCampaign: [
      { name: "Catarata Premium SP", leads: 387 },
      { name: "Refrativa LASIK SP", leads: 298 },
      { name: "Plástica Ocular RJ", leads: 156 },
      { name: "Catarata BH", leads: 134 },
      { name: "Refrativa Curitiba", leads: 89 },
      { name: "Cirurgia Refrativa Floripa", leads: 67 },
    ],
    perCity: [
      { city: "São Paulo", leads: 412, pct: 33 },
      { city: "Rio de Janeiro", leads: 287, pct: 23 },
      { city: "Belo Horizonte", leads: 198, pct: 16 },
      { city: "Brasília", leads: 134, pct: 11 },
      { city: "Curitiba", leads: 98, pct: 8 },
      { city: "Outras capitais", leads: 118, pct: 9 },
    ],
    perCreative: [
      { name: "VSL Catarata 60s", leads: 234, thumb: "🎬" },
      { name: "Carrossel Refrativa", leads: 187, thumb: "🖼️" },
      { name: "Reel Depoimento Cirurgião", leads: 156, thumb: "🎥" },
      { name: "Vídeo Antes/Depois", leads: 142, thumb: "📸" },
      { name: "Imagem Estática Refrativa", leads: 89, thumb: "🖼️" },
      { name: "Reel Bastidores Clínica", leads: 67, thumb: "🎥" },
    ],
  },
  quality: {
    valid: 847,
    invalid: 400,
    timeToContact: 3.2,
    respondedWithin5Min: 87,
  },
  sdr: {
    contactRate: 68.6,
    schedulingRate: 48.1,
    abandonedLeads: 142,
    perSDR: [
      { name: "Ana Lima",       contactRate: 78, conversion: 38, leads: 234, surgeries: 17 },
      { name: "Carla Souza",    contactRate: 72, conversion: 32, leads: 198, surgeries: 12 },
      { name: "Bruno Mendes",   contactRate: 65, conversion: 28, leads: 187, surgeries: 9 },
      { name: "Felipe Santos",  contactRate: 61, conversion: 24, leads: 156, surgeries: 7 },
      { name: "Mariana Costa",  contactRate: 58, conversion: 22, leads: 134, surgeries: 6 },
    ],
  },
  conversions: [
    { from: "Lead", to: "Contato", rate: 68.6, color: "#DFFF00" },
    { from: "Contato", to: "Consulta", rate: 48.1, color: "#A8E5FF" },
    { from: "Consulta", to: "Cirurgia", rate: 31.0, color: "#FFB876" },
  ],
  financial: {
    cacPerSurgery: 982,
    cacPerConsult: 305,
    roi: 312,
    roas: 4.12,
    revenue: 358700,
    deltaRevenue: 18,
  },
  channels: {
    performance: [
      { channel: "Google Ads · Catarata", leads: 587, invest: 38000, cac: 968 },
      { channel: "Meta Ads · Refrativa",  leads: 412, invest: 31000, cac: 1240 },
      { channel: "Google Ads · Refrativa", leads: 156, invest: 12000, cac: 1850 },
      { channel: "Meta Ads · Catarata",   leads: 92,  invest: 6450,  cac: 2103 },
    ],
    cacPerCampaign: [
      { campaign: "Catarata Premium SP", cac: 98 },
      { campaign: "Refrativa LASIK SP", cac: 145 },
      { campaign: "Cirurgia Refrativa BH", cac: 167 },
      { campaign: "Plástica Ocular RJ", cac: 210 },
    ],
    revenuePerChannel: [
      { channel: "Google Ads", revenue: 218000 },
      { channel: "Meta Ads", revenue: 140700 },
    ],
  },
  tech: [
    { name: "Dashboard em tempo real", detail: "Atualizando a cada 60s",   icon: BarChart3 },
    { name: "Integração CRM",          detail: "Sincronizado há 2 min",    icon: Database },
    { name: "Integração WhatsApp",     detail: "3 instâncias conectadas",  icon: MessageCircle },
    { name: "Integração Mídia",        detail: "Google + Meta Ads",        icon: Megaphone },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const fmtBRLCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace(".", ",")}k`;
  return fmtBRL(v);
};

const fmtNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

// CountUp simples sem dep externa
function useCountUp(target: number, duration = 1400, decimals = 0): number {
  const [val, setVal] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return parseFloat(val.toFixed(decimals));
}

function AnimatedNumber({
  value, prefix = "", suffix = "", decimals = 0, className = "",
}: { value: number; prefix?: string; suffix?: string; decimals?: number; className?: string }) {
  const animated = useCountUp(value, 1400, decimals);
  return (
    <span className={className}>
      {prefix}
      {decimals > 0 ? animated.toFixed(decimals).replace(".", ",") : fmtNum(Math.round(animated))}
      {suffix}
    </span>
  );
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function Section({
  index, title, subtitle, children,
}: { index: string; title: string; subtitle?: string; children: React.ReactNode }) {
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

// ─── Delta Indicator ──────────────────────────────────────────────────────────

function Delta({ value, invertColor = false }: { value: number; invertColor?: boolean }) {
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

// ─── 0. Hero · Indicadores Prioritários ───────────────────────────────────────

function HeroPriority() {
  const cards = [
    {
      label: "Tempo até 1º contato",
      value: MOCK.priority.timeToContact.value,
      unit: " min",
      decimals: 1,
      delta: MOCK.priority.timeToContact.delta,
      icon: Timer,
      hint: "Mais rápido é melhor",
      invertDelta: true,
      accent: "bg-amber-50",
      accentIcon: "text-amber-700",
    },
    {
      label: "Taxa de agendamento",
      value: MOCK.priority.schedulingRate.value,
      unit: "%",
      decimals: 1,
      delta: MOCK.priority.schedulingRate.delta,
      icon: CalendarCheck,
      hint: "Contato → Consulta",
      accent: "bg-emerald-50",
      accentIcon: "text-emerald-700",
    },
    {
      label: "Conversão cirurgia",
      value: MOCK.priority.surgeryConversion.value,
      unit: "%",
      decimals: 1,
      delta: MOCK.priority.surgeryConversion.delta,
      icon: Stethoscope,
      hint: "Lead → Cirurgia realizada",
      accent: "bg-rose-50",
      accentIcon: "text-rose-700",
    },
    {
      label: "CAC por cirurgia",
      value: MOCK.priority.cacPerSurgery.value,
      prefix: "R$ ",
      delta: MOCK.priority.cacPerSurgery.delta,
      icon: Wallet,
      hint: "Custo de aquisição",
      invertDelta: true,
      accent: "bg-violet-50",
      accentIcon: "text-violet-700",
    },
  ];

  return (
    <div className="relative">
      {/* Glow lime sutil de fundo */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute top-0 left-1/4 w-[400px] h-[200px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, #DFFF00 0%, transparent 70%)" }} />
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "#11131F" }}>
              <Sparkles className="h-4 w-4 text-[#DFFF00]" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-semibold">Painel Executivo</p>
            <h1 className="text-xl font-semibold text-gray-900 leading-tight">Indicadores Prioritários</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Atualizado agora</p>
          <p className="text-xs text-gray-700 font-medium">Período · Últimos 30 dias</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.5 }}
            whileHover={{ y: -3 }}
            className="group relative bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-md transition-all overflow-hidden"
          >
            {/* Faixa de destaque no topo */}
            <div className="absolute top-0 left-0 right-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity"
                 style={{ background: "linear-gradient(90deg, #DFFF00, transparent)" }} />

            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${c.accent} flex items-center justify-center`}>
                <c.icon className={`h-4 w-4 ${c.accentIcon}`} />
              </div>
              {c.delta !== undefined && <Delta value={c.delta} invertColor={c.invertDelta} />}
            </div>

            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">{c.label}</p>

            <div className="flex items-baseline gap-0.5">
              <AnimatedNumber
                value={c.value}
                decimals={c.decimals ?? 0}
                prefix={c.prefix ?? ""}
                className="text-3xl font-bold text-gray-900 tabular-nums tracking-tight"
              />
              {c.unit && <span className="text-base text-gray-400 font-medium">{c.unit}</span>}
            </div>

            <p className="text-[11px] text-gray-400 mt-2">{c.hint}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── 1. Funil da Operação ─────────────────────────────────────────────────────

function FunilOperacao() {
  const top = MOCK.funnel[0].count;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Visualização do funil */}
      <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-6">
        <div className="space-y-2">
          {MOCK.funnel.map((stage, i) => {
            const width = (stage.count / top) * 100;
            const previous = i > 0 ? MOCK.funnel[i - 1].count : null;
            const dropoff = previous ? (((previous - stage.count) / previous) * 100).toFixed(1) : null;
            return (
              <motion.div
                key={stage.stage}
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 0.1 + 0.1 * i, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: "left" }}
                className="relative"
              >
                <div className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-right">
                    <p className="text-xs text-gray-500">{stage.stage}</p>
                  </div>
                  <div className="flex-1 relative" style={{ height: 56 }}>
                    <div
                      className="absolute left-0 top-0 bottom-0 rounded-r-lg flex items-center px-4 shadow-sm"
                      style={{
                        width: `${width}%`,
                        background: i === MOCK.funnel.length - 1
                          ? "linear-gradient(90deg, #11131F 0%, #1f2238 100%)"
                          : `linear-gradient(90deg, ${stage.color}EE 0%, ${stage.color}99 100%)`,
                      }}
                    >
                      <span className={`font-mono font-bold text-base tabular-nums ${i === MOCK.funnel.length - 1 ? "text-[#DFFF00]" : "text-gray-900"}`}>
                        {fmtNum(stage.count)}
                      </span>
                      <span className={`ml-2 text-[11px] font-medium ${i === MOCK.funnel.length - 1 ? "text-white/70" : "text-gray-700/70"}`}>
                        {((stage.count / top) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                {dropoff && (
                  <div className="ml-32 pl-3 mt-0.5 mb-0.5">
                    <span className="text-[10px] text-red-400 font-medium">↓ {dropoff}% drop-off</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Resumo lateral */}
      <div className="lg:col-span-2 space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Conversão total</p>
          <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">
            <AnimatedNumber value={(MOCK.funnel[4].count / MOCK.funnel[0].count) * 100} decimals={1} suffix="%" />
          </p>
          <p className="text-xs text-gray-500 mt-1">de {fmtNum(MOCK.funnel[0].count)} leads a {fmtNum(MOCK.funnel[4].count)} cirurgias</p>
        </div>
        <div className="bg-gradient-to-br from-[#11131F] to-[#1f2238] rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl bg-[#DFFF00]" />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-wider text-white/50 font-medium">Receita potencial</p>
            <p className="text-3xl font-bold mt-1 tabular-nums">
              <AnimatedNumber value={358700} prefix="R$ " />
            </p>
            <p className="text-xs text-white/60 mt-1">com 89 cirurgias realizadas</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Maior gargalo</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">Lead → Contato</p>
          <p className="text-xs text-gray-500 mt-1">31,4% dos leads não foram contatados</p>
        </div>
      </div>
    </div>
  );
}

// ─── 2. Indicadores de Mídia ──────────────────────────────────────────────────

function IndicadoresMidia() {
  return (
    <div className="space-y-4">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricBox icon={Wallet} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="Investimento total" value={fmtBRLCompact(MOCK.media.totalInvestment)} delta={12} hint="vs período anterior" />
        <MetricBox icon={MousePointerClick} iconBg="bg-blue-50" iconColor="text-blue-600"
          label="CTR médio" value={`${MOCK.media.ctr.toString().replace(".", ",")}%`} delta={3} hint="Acima da média do setor" />
        <MetricBox icon={DollarSign} iconBg="bg-violet-50" iconColor="text-violet-600"
          label="CPC médio" value={fmtBRL(MOCK.media.cpc)} delta={-5} invertDelta hint="Quanto menor, melhor" />
        <MetricBox icon={Target} iconBg="bg-rose-50" iconColor="text-rose-600"
          label="CPL médio" value={fmtBRL(MOCK.media.cpl)} delta={-8} invertDelta hint="Custo por lead" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leads por campanha */}
        <ChartCard title="Leads por campanha" icon={Megaphone} subtitle="Top 6 do período">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={MOCK.media.perCampaign} layout="vertical" margin={{ left: 4, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" stroke="#D1D5DB" tick={{ fill: "#9CA3AF", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="#D1D5DB" tick={{ fill: "#6B7280", fontSize: 10 }} tickLine={false} axisLine={false} width={130} />
              <RTooltip cursor={{ fill: "#F9FAFB" }} formatter={(v: number) => [fmtNum(v) + " leads", ""]}
                contentStyle={{ borderRadius: 12, border: "1px solid #F3F4F6", fontSize: 12 }} />
              <Bar dataKey="leads" radius={[0, 6, 6, 0]} maxBarSize={20}>
                {MOCK.media.perCampaign.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "#DFFF00" : "#11131F"} fillOpacity={i === 0 ? 1 : 0.85 - i * 0.1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Leads por cidade */}
        <ChartCard title="Leads por cidade" icon={MapPin} subtitle="Distribuição geográfica">
          <div className="space-y-2.5">
            {MOCK.media.perCity.map((c, i) => (
              <motion.div
                key={c.city}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.4 }}
                className="group"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-gray-700 font-medium">{c.city}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-gray-400">{c.pct}%</span>
                    <span className="text-xs text-gray-900 font-semibold tabular-nums">{fmtNum(c.leads)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${c.pct * 3}%` }}
                    transition={{ delay: 0.1 + 0.05 * i, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full"
                    style={{
                      background: i === 0
                        ? "linear-gradient(90deg, #DFFF00, #b3cc00)"
                        : "linear-gradient(90deg, #11131F, #4a4d65)",
                      maxWidth: "100%",
                    }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </ChartCard>

        {/* Leads por criativo */}
        <ChartCard title="Leads por criativo" icon={ImageIcon} subtitle="Performance criativa">
          <div className="space-y-2">
            {MOCK.media.perCreative.map((c, i) => (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.4 }}
                className="flex items-center gap-3 group hover:bg-gray-50 rounded-lg px-2 -mx-2 py-1.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-base group-hover:bg-[#DFFF00] transition-colors">
                  {c.thumb}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-900 rounded-full"
                           style={{ width: `${(c.leads / MOCK.media.perCreative[0].leads) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium tabular-nums">{c.leads}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

// ─── 3. Qualidade do Lead ─────────────────────────────────────────────────────

function QualidadeLead() {
  const total = MOCK.quality.valid + MOCK.quality.invalid;
  const validPct = Math.round((MOCK.quality.valid / total) * 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Donut Válidos/Inválidos */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="h-4 w-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">Distribuição de qualidade</p>
        </div>
        <div className="grid grid-cols-2 gap-4 items-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={[
                  { name: "Válidos", value: MOCK.quality.valid, color: "#DFFF00" },
                  { name: "Inválidos", value: MOCK.quality.invalid, color: "#FECACA" },
                ]}
                cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" strokeWidth={0}
              >
                <Cell fill="#DFFF00" />
                <Cell fill="#FECACA" />
              </Pie>
              <RTooltip contentStyle={{ borderRadius: 12, border: "1px solid #F3F4F6", fontSize: 12 }} />
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                <tspan x="50%" dy="-6" fontSize="22" fontWeight="700" fill="#111827">{validPct}%</tspan>
                <tspan x="50%" dy="18" fontSize="10" fill="#9CA3AF">válidos</tspan>
              </text>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-sm bg-[#DFFF00]" />
              <div>
                <p className="text-xs text-gray-500">Válidos</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  <AnimatedNumber value={MOCK.quality.valid} />
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-sm bg-red-200" />
              <div>
                <p className="text-xs text-gray-500">Inválidos</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  <AnimatedNumber value={MOCK.quality.invalid} />
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Total recebido</p>
              <p className="text-sm font-semibold text-gray-700 tabular-nums">{fmtNum(total)} leads</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tempo e SLA */}
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-semibold text-gray-700">Tempo até primeiro contato</p>
            </div>
            <Delta value={-18} invertColor />
          </div>
          <div className="flex items-baseline gap-1">
            <AnimatedNumber value={MOCK.quality.timeToContact} decimals={1} className="text-4xl font-bold text-gray-900 tabular-nums" />
            <span className="text-lg text-gray-400">min</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Média de resposta da operação no período</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-[#DFFF00] opacity-10" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-gray-700">% Atendidos em ≤5 minutos</p>
              </div>
              <Delta value={12} />
            </div>
            <ResponsiveContainer width="100%" height={90}>
              <RadialBarChart innerRadius="65%" outerRadius="100%" data={[{ value: MOCK.quality.respondedWithin5Min }]} startAngle={180} endAngle={0}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background={{ fill: "#F3F4F6" }} dataKey="value" cornerRadius={20} fill="#DFFF00" />
                <text x="50%" y="80%" textAnchor="middle" dominantBaseline="middle">
                  <tspan fontSize="32" fontWeight="700" fill="#111827">{MOCK.quality.respondedWithin5Min}%</tspan>
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-1 text-center">Meta operacional: 90% · Estamos a 3pp do alvo</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 4. Indicadores SDR ───────────────────────────────────────────────────────

function IndicadoresSDR() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* KPIs do time */}
      <div className="space-y-3">
        <MetricBox icon={UserCheck} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="Taxa de contato" value={`${MOCK.sdr.contactRate.toString().replace(".", ",")}%`}
          delta={4} hint="Leads atendidos no período" />
        <MetricBox icon={CalendarCheck} iconBg="bg-blue-50" iconColor="text-blue-600"
          label="Taxa de agendamento" value={`${MOCK.sdr.schedulingRate.toString().replace(".", ",")}%`}
          delta={12} hint="Contatos que viraram consulta" />
        <MetricBox icon={UserX} iconBg="bg-red-50" iconColor="text-red-500"
          label="Leads abandonados" value={fmtNum(MOCK.sdr.abandonedLeads)}
          delta={-22} invertDelta hint="Não retornaram ao SDR" />
      </div>

      {/* Ranking SDR */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-700">Ranking · Conversão por SDR</p>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-gray-400">Últimos 30 dias</span>
        </div>
        <div className="space-y-3">
          {MOCK.sdr.perSDR.map((s, i) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.4 }}
              className="flex items-center gap-3 group"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-[#DFFF00] text-gray-900" : "bg-gray-100 text-gray-500"}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                  <p className="text-sm font-bold text-gray-900 tabular-nums">{s.conversion}%</p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(s.conversion / 40) * 100}%` }}
                      transition={{ delay: 0.1 + 0.05 * i, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-full"
                      style={{
                        background: i === 0
                          ? "linear-gradient(90deg, #DFFF00, #b3cc00)"
                          : "linear-gradient(90deg, #11131F, #4a4d65)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 tabular-nums w-14 text-right">{s.surgeries} cirurgias</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 5. Conversão do Funil ────────────────────────────────────────────────────

function ConversaoFunil() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex flex-col md:flex-row items-center gap-4 md:gap-0">
        {MOCK.conversions.map((conv, i) => (
          <div key={i} className="flex items-center gap-4 flex-1">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 * i, duration: 0.5 }}
              className="flex-1 text-center relative group"
            >
              <div className="relative inline-block">
                <ResponsiveContainer width={140} height={140}>
                  <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ value: conv.rate, fill: conv.color }]} startAngle={90} endAngle={-270}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background={{ fill: "#F3F4F6" }} dataKey="value" cornerRadius={20} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">
                      <AnimatedNumber value={conv.rate} decimals={1} suffix="%" />
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-900 mt-2">{conv.from} → {conv.to}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {i === 0 ? "Atendimento" : i === 1 ? "Qualificação" : "Conversão final"}
              </p>
            </motion.div>
            {i < MOCK.conversions.length - 1 && (
              <ArrowRight className="h-5 w-5 text-gray-300 hidden md:block shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 6. Indicadores Financeiros ───────────────────────────────────────────────

function IndicadoresFinanceiros() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <MetricBox icon={Wallet} iconBg="bg-violet-50" iconColor="text-violet-600"
        label="CAC por cirurgia" value={fmtBRL(MOCK.financial.cacPerSurgery)} delta={-8} invertDelta />
      <MetricBox icon={Wallet} iconBg="bg-blue-50" iconColor="text-blue-600"
        label="CAC por consulta" value={fmtBRL(MOCK.financial.cacPerConsult)} delta={-12} invertDelta />
      <MetricBox icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600"
        label="ROI" value={`${MOCK.financial.roi}%`} delta={28} />
      <MetricBox icon={Target} iconBg="bg-amber-50" iconColor="text-amber-600"
        label="ROAS" value={`${MOCK.financial.roas.toFixed(2).replace(".", ",")}x`} delta={15} />

      {/* Card destacado de receita */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="col-span-2 md:col-span-3 lg:col-span-1 bg-gradient-to-br from-[#DFFF00] to-[#b3cc00] rounded-2xl p-5 relative overflow-hidden"
      >
        <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-white/20 blur-xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-gray-900/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-gray-900" />
            </div>
            <Delta value={MOCK.financial.deltaRevenue} />
          </div>
          <p className="text-[11px] uppercase tracking-wider text-gray-900/60 font-medium">Receita gerada</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
            <AnimatedNumber value={MOCK.financial.revenue} prefix="R$ " />
          </p>
          <p className="text-[11px] text-gray-900/70 mt-2">No período · 89 cirurgias</p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── 7. Análise por Canal ─────────────────────────────────────────────────────

function AnaliseCanal() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Performance por canal */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">Performance · canal + procedimento</p>
        </div>
        <div className="space-y-3">
          {MOCK.channels.performance.map((p, i) => (
            <motion.div
              key={p.channel}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.4 }}
              className="grid grid-cols-12 gap-3 items-center py-2 border-b border-gray-50 last:border-0"
            >
              <div className="col-span-4">
                <p className="text-sm font-medium text-gray-900 truncate">{p.channel}</p>
                <p className="text-[10px] text-gray-400">{fmtBRLCompact(p.invest)} investido</p>
              </div>
              <div className="col-span-5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(p.leads / 600) * 100}%` }}
                      transition={{ delay: 0.1 + 0.05 * i, duration: 0.6 }}
                      className="h-full rounded-full"
                      style={{ background: i === 0 ? "linear-gradient(90deg, #DFFF00, #b3cc00)" : "#11131F" }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700 tabular-nums w-10 text-right">{p.leads}</span>
                </div>
              </div>
              <div className="col-span-3 text-right">
                <p className="text-xs text-gray-500">CAC</p>
                <p className="text-sm font-bold text-gray-900 tabular-nums">{fmtBRL(p.cac)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Receita por canal + CAC por campanha */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Receita por canal</p>
          <div className="space-y-3">
            {MOCK.channels.revenuePerChannel.map((r, i) => {
              const total = MOCK.channels.revenuePerChannel.reduce((s, x) => s + x.revenue, 0);
              const pct = (r.revenue / total) * 100;
              return (
                <div key={r.channel}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 font-medium">{r.channel}</span>
                    <span className="text-gray-900 font-bold tabular-nums">{fmtBRLCompact(r.revenue)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.1 + i * 0.1, duration: 0.7 }}
                      className="h-full rounded-full"
                      style={{ background: i === 0 ? "linear-gradient(90deg, #DFFF00, #b3cc00)" : "#11131F" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">CAC por campanha (top 4)</p>
          <div className="space-y-2">
            {MOCK.channels.cacPerCampaign.map((c, i) => (
              <div key={c.campaign} className="flex items-baseline justify-between">
                <span className="text-xs text-gray-600 truncate flex-1">{c.campaign}</span>
                <span className="text-xs font-bold text-gray-900 tabular-nums ml-2">{fmtBRL(c.cac)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 8. Estrutura Técnica ─────────────────────────────────────────────────────

function EstruturaTecnica() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {MOCK.tech.map((t, i) => (
        <motion.div
          key={t.name}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.4 }}
          className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-gray-200 transition-all group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-[#DFFF00]/20 transition-colors">
              <t.icon className="h-4 w-4 text-gray-700" />
            </div>
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 rounded-md">
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
              <span className="text-[10px] text-emerald-700 font-semibold">Ativo</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-900">{t.name}</p>
          <p className="text-[11px] text-gray-500 mt-1">{t.detail}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Sub-components reutilizáveis ─────────────────────────────────────────────

function MetricBox({
  icon: Icon, iconBg, iconColor, label, value, delta, invertDelta, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string; iconColor: string;
  label: string; value: string;
  delta?: number; invertDelta?: boolean; hint?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
      className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-gray-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        {delta !== undefined && <Delta value={delta} invertColor={invertDelta} />}
      </div>
      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>}
    </motion.div>
  );
}

function ChartCard({
  title, subtitle, icon: Icon, children,
}: { title: string; subtitle?: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 h-full">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">{title}</p>
        </div>
        {subtitle && <p className="text-[10px] uppercase tracking-wider text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function OperationalDashV2() {
  return (
    <div className="h-full overflow-y-auto bg-[#FAFAF7]">
      <div className="max-w-[1400px] mx-auto p-6 lg:p-10 pb-20">
        <HeroPriority />

        <Section index="01" title="Funil da Operação" subtitle="Da geração de lead à cirurgia realizada">
          <FunilOperacao />
        </Section>

        <Section index="02" title="Indicadores de Mídia" subtitle="Performance dos canais de aquisição">
          <IndicadoresMidia />
        </Section>

        <Section index="03" title="Qualidade do Lead" subtitle="Validade da base + velocidade de resposta">
          <QualidadeLead />
        </Section>

        <Section index="04" title="Indicadores SDR" subtitle="Performance individual e do time">
          <IndicadoresSDR />
        </Section>

        <Section index="05" title="Conversão do Funil" subtitle="Taxa de avanço entre cada etapa">
          <ConversaoFunil />
        </Section>

        <Section index="06" title="Indicadores Financeiros" subtitle="Receita, custos e retorno do investimento">
          <IndicadoresFinanceiros />
        </Section>

        <Section index="07" title="Análise por Canal" subtitle="Comparativo de canais e campanhas">
          <AnaliseCanal />
        </Section>

        <Section index="08" title="Estrutura Técnica" subtitle="Status das integrações e fontes de dados">
          <EstruturaTecnica />
        </Section>

        <div className="mt-16 text-center">
          <p className="text-[11px] text-gray-400">
            Painel atualizado em tempo real · Dados protegidos · Sougni · 2026
          </p>
        </div>
      </div>
    </div>
  );
}
