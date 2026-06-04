import { Plus, Smartphone, Battery, BatteryCharging, LayoutDashboard, Globe, Wifi, WifiOff, Megaphone, Headphones } from "lucide-react";
import { formatPhoneUid } from "@/lib/formatPhone";
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
  activeView?: "contacts" | "analytics" | "global" | "dashboard" | "midia" | "operacao";
  onSelectDashboard?: () => void;
  onSelectGlobal?: () => void;
  onSelectMidia?: () => void;
  onSelectOperacao?: () => void;
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
  onSelectMidia,
  onSelectOperacao,
}: InstanceSidebarProps) {
  const offlineIds = new Set(offlineAlerts.map((a) => a.instanceId));
  const onlineCount = instances.filter((i) => i.status === "online").length;
  const offlineCount = instances.filter((i) => i.status === "offline").length;

  return (
    <aside className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-sidebar">

      {/* ── Navegação Global ─────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 space-y-0.5">
        <button
          onClick={onSelectDashboard}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm font-medium ${
            activeView === "dashboard" && !selectedInstance
              ? "btn-primary"
              : "text-foreground/70 hover:bg-sidebar-accent hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span>Dashboard</span>
          {offlineCount > 0 && (
            <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              activeView === "dashboard" && !selectedInstance
                ? "bg-destructive text-white"
                : "bg-destructive/10 text-destructive"
            }`}>
              {offlineCount} off
            </span>
          )}
        </button>

        <button
          onClick={onSelectOperacao}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm font-medium ${
            activeView === "operacao" && !selectedInstance
              ? "btn-primary"
              : "text-foreground/70 hover:bg-sidebar-accent hover:text-foreground"
          }`}
        >
          <Headphones className="w-4 h-4 shrink-0" />
          <span>Operação</span>
        </button>

        <button
          onClick={onSelectGlobal}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm font-medium ${
            activeView === "global" && !selectedInstance
              ? "btn-primary"
              : "text-foreground/70 hover:bg-sidebar-accent hover:text-foreground"
          }`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span>Todos os Contatos</span>
        </button>

        <button
          onClick={onSelectMidia}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm font-medium ${
            activeView === "midia" && !selectedInstance
              ? "btn-primary"
              : "text-foreground/70 hover:bg-sidebar-accent hover:text-foreground"
          }`}
        >
          <Megaphone className="w-4 h-4 shrink-0" />
          <span>Criativos</span>
        </button>
      </div>

      {/* ── Divisor ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 mt-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Canais</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* ── Status summary ───────────────────────────────────────────── */}
      {instances.length > 0 && (
        <div className="flex items-center gap-3 px-4 pb-2">
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <Wifi className="w-3 h-3" />
            {onlineCount} online
          </span>
          {offlineCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-destructive font-medium">
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
            <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center mx-auto mb-3">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Nenhum canal cadastrado.
              <br />
              Clique no botão abaixo para adicionar.
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
      <div className="px-3 pb-3 pt-2 border-t border-border">
        <button
          onClick={onAddInstance}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar canal
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

  const displayName = instance.alias || formatPhoneUid(instance.uid);
  const tooltipText = instance.alias ? `${instance.alias} · ${instance.uid}` : instance.uid;

  return (
    <button
      onClick={onClick}
      title={tooltipText}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group ${
        isSelected
          ? "bg-sidebar-accent shadow-sm"
          : "hover:bg-muted/50"
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
          isSelected ? "bg-card border border-border" : "bg-muted group-hover:bg-card group-hover:border group-hover:border-border"
        }`}>
          <Smartphone className="w-4 h-4 text-foreground/60" />
        </div>
        {/* Status dot */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar ${
            isOnline ? "bg-emerald-500" : isOffline ? "bg-destructive" : "bg-muted-foreground/40"
          } ${hasAlert ? "pulse-alert" : ""}`}
          aria-label={isOnline ? "online" : isOffline ? "offline" : "desconhecido"}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className={`text-sm font-medium truncate ${isSelected ? "text-foreground" : "text-foreground/85"}`}>
            {displayName}
          </span>
          {instance.battery !== null && instance.battery !== undefined && (
            <BatteryIndicator battery={instance.battery} plugged={instance.plugged ?? false} />
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[11px] font-medium ${
            isOnline ? "text-emerald-600" : isOffline ? "text-destructive" : "text-muted-foreground"
          }`}>
            {isOnline ? "Ativo" : isOffline ? "Offline" : "—"}
          </span>
          {instance.platform && (
            <span className="text-[11px] text-muted-foreground capitalize">· {instance.platform}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function BatteryIndicator({ battery, plugged }: { battery: number; plugged: boolean }) {
  const Icon = plugged ? BatteryCharging : Battery;
  const color = battery > 50 ? "text-emerald-500" : battery > 20 ? "text-amber-500" : "text-destructive";
  return (
    <span className={`flex items-center gap-0.5 text-[10px] ${color} flex-shrink-0 ml-auto`} title={`${battery}% ${plugged ? "carregando" : ""}`}>
      <Icon className="w-3 h-3" />
      <span className="tabular">{battery}%</span>
    </span>
  );
}
