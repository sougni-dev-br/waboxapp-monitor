import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, MessageSquare, Users, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AnalyticsPanelProps {
  instanceId: number;
  instanceAlias?: string | null;
}

const RANGE_OPTIONS = [
  { label: "7 dias", value: 7 },
  { label: "14 dias", value: 14 },
  { label: "30 dias", value: 30 },
];

export function AnalyticsPanel({ instanceId, instanceAlias }: AnalyticsPanelProps) {
  const [days, setDays] = useState(14);
  const [showRangeMenu, setShowRangeMenu] = useState(false);

  const { data: stats = [], isLoading, dataUpdatedAt } = trpc.analytics.dailyContacts.useQuery(
    { instanceId, days },
    { refetchInterval: 60_000 } // Atualiza a cada 1 minuto
  );

  const totalNewContacts = stats.reduce((sum, s) => sum + Number(s.newContacts), 0);
  const totalMessages = stats.reduce((sum, s) => sum + Number(s.totalMessages), 0);
  const avgPerDay = stats.length > 0 ? Math.round(totalNewContacts / stats.length) : 0;

  const chartData = stats.map((s) => ({
    date: s.date,
    label: format(parseISO(s.date), "dd/MM", { locale: ptBR }),
    "Novos Contatos": Number(s.newContacts),
    "Mensagens": Number(s.totalMessages),
  }));

  const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "--";

  return (
    <div className="flex flex-col gap-4 p-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Analytics</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {instanceAlias ?? instanceId} · Atualizado às {lastUpdated}
          </p>
        </div>

        {/* Seletor de período */}
        <div className="relative">
          <button
            onClick={() => setShowRangeMenu(!showRangeMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {RANGE_OPTIONS.find((o) => o.value === days)?.label ?? "14 dias"}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showRangeMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-10 overflow-hidden">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setDays(opt.value); setShowRangeMenu(false); }}
                  className={`block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 transition-colors ${days === opt.value ? "text-gray-900 font-semibold" : "text-gray-600"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={<Users className="w-4 h-4 text-indigo-500" />}
          label="Novos contatos"
          value={totalNewContacts}
          sub={`${days} dias`}
        />
        <SummaryCard
          icon={<MessageSquare className="w-4 h-4 text-emerald-500" />}
          label="Mensagens"
          value={totalMessages}
          sub={`${days} dias`}
        />
        <SummaryCard
          icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
          label="Média/dia"
          value={avgPerDay}
          sub="novos contatos"
        />
      </div>

      {/* Gráfico */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Novos contatos por dia
        </p>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center">
            <BarChart className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-xs text-gray-400">Nenhum dado disponível.</p>
            <p className="text-xs text-gray-300 mt-1">As conversas aparecerão aqui via webhook.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #f3f4f6",
                  borderRadius: "12px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  fontSize: "12px",
                }}
                cursor={{ fill: "#f9fafb" }}
              />
              <Bar dataKey="Novos Contatos" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico de mensagens */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Mensagens por dia
        </p>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center">
            <MessageSquare className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-xs text-gray-400">Nenhum dado disponível.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #f3f4f6",
                  borderRadius: "12px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  fontSize: "12px",
                }}
                cursor={{ fill: "#f9fafb" }}
              />
              <Bar dataKey="Mensagens" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tabela de dados */}
      {chartData.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Detalhe por dia
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {[...chartData].reverse().map((row) => (
              <div key={row.date} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-gray-500">
                  {format(parseISO(row.date), "EEEE, dd/MM", { locale: ptBR })}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-indigo-600 font-medium">
                    {row["Novos Contatos"]} contatos
                  </span>
                  <span className="text-xs text-emerald-600 font-medium">
                    {row["Mensagens"]} msgs
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-3.5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
