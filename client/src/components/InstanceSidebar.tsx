import { Plus, Smartphone, Battery, BatteryCharging, LayoutDashboard, Globe, Wifi, WifiOff } from "lucide-react";
import type { OfflineAlertItem } from "./OfflineAlert";

interface Instance {
  id: number;
  uid: string;
  alias?: string | null;
  status: "online" | "offline" | "unknown";
  platform?: string | null;
  battery?: number | null;
  plugged?: boolean | null;
  lastCheckedAt?: Date | string | null;
}

interface InstanceSidebarProps {
  instances: Instance[];
  selectedInstance: Instance | null;
  onSelect: (instance: Instance) => void;
  onAddInstance: () => void;
  offlineAlerts: OfflineAlertItem[];
  activeView?: "contacts" | "analytics" | "global" | "dashboard";
  onSelectDashboard?: () => void;
  onSelectGlobal?: () => void;
}

export function InstanceSidebar({
  instances,
  selectedInstance,
  onSelect,
  onAddInstance,
  offlineAlerts,
  activeView,
  onSelectDashboard,
  onSelectGlobal,
}: InstanceSidebarProps) {
  const offlineIds = new Set(offlineAlerts.map((a) => a.instanceId));
  const onlineCount = instances.filter((i) => i.status === "online").length;
  const offlineCount = instances.filter((i) => i.status === "offline").length;

  return (
    <aside className="w-60 flex-shrink-0 border-r border-gray-100 flex flex-col bg-white">

      {/* ── Navegação Global ─────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 space-y-0.5">
        {/* Dashboard */}
        <button
          onClick={onSelectDashboard}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm font-medium ${
            activeView === "dashboard" && !selectedInstance
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span>Dashboard</span>
          {offlineCount > 0 && (
            <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              activeView === "dashboard" && !selectedInstance
                ? "bg-red-500 text-white"
                : "bg-red-100 text-red-600"
            }`}>
              {offlineCount} off
            </span>
          )}
        </button>

        {/* Todos os Contatos */}
        <button
          onClick={onSelectGlobal}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm font-medium ${
            activeView === "global" && !selectedInstance
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span>Todos os Contatos</span>
        </button>
      </div>

      {/* ── Divisor com label ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Instâncias</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* ── Status summary ───────────────────────────────────────────── */}
      {instances.length > 0 && (
        <div className="flex items-center gap-3 px-4 pb-2">
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <Wifi className="w-3 h-3" />
            {onlineCount} online
          </span>
          {offlineCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
              <WifiOff className="w-3 h-3" />
              {offlineCount} offline
            </span>
          )}
        </div>
      )}

      {/* ── Lista de instâncias ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {instances.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Smartphone className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Nenhuma instância.
              <br />
              Clique em + para adicionar.
            </p>
          </div>
        ) : (
          instances.map((instance) => (
            <InstanceItem
              key={instance.id}
              instance={instance}
              isSelected={selectedInstance?.id === instance.id && activeView !== "dashboard" && activeView !== "global"}
              hasAlert={offlineIds.has(instance.id)}
              onClick={() => onSelect(instance)}
            />
          ))
        )}
      </div>

      {/* ── Footer: adicionar instância ──────────────────────────────── */}
      <div className="px-3 pb-3 pt-1 border-t border-gray-50">
        <button
          onClick={onAddInstance}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar instância
        </button>
      </div>
    </aside>
  );
}

function InstanceItem({
  instance,
  isSelected,
  hasAlert,
  onClick,
}: {
  instance: Instance;
  isSelected: boolean;
  hasAlert: boolean;
  onClick: () => void;
}) {
  const isOnline = instance.status === "online";
  const isOffline = instance.status === "offline";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group ${
        isSelected
          ? "bg-gray-100 shadow-sm"
          : "hover:bg-gray-50"
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
          isSelected ? "bg-gray-200" : "bg-gray-100 group-hover:bg-gray-200"
        }`}>
          <Smartphone className="w-4 h-4 text-gray-500" />
        </div>
        {/* Status dot */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
            isOnline ? "bg-emerald-500" : isOffline ? "bg-red-400" : "bg-gray-300"
          } ${hasAlert ? "pulse-alert" : ""}`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className={`text-sm font-medium truncate ${isSelected ? "text-gray-900" : "text-gray-700"}`}>
            {instance.alias || instance.uid}
          </span>
          {instance.battery !== null && instance.battery !== undefined && (
            <BatteryIndicator battery={instance.battery} plugged={instance.plugged ?? false} />
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[11px] font-medium ${
            isOnline ? "text-emerald-600" : isOffline ? "text-red-500" : "text-gray-400"
          }`}>
            {isOnline ? "Ativo" : isOffline ? "Offline" : "—"}
          </span>
          {instance.platform && (
            <span className="text-[11px] text-gray-400">· {instance.platform}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function BatteryIndicator({ battery, plugged }: { battery: number; plugged: boolean }) {
  const Icon = plugged ? BatteryCharging : Battery;
  const color = battery > 50 ? "text-emerald-500" : battery > 20 ? "text-amber-500" : "text-red-500";
  return (
    <span className={`flex items-center gap-0.5 text-[10px] ${color} flex-shrink-0 ml-auto`}>
      <Icon className="w-3 h-3" />
      <span>{battery}%</span>
    </span>
  );
}
