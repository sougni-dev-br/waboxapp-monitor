import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useSSE } from "@/hooks/useSSE";
import { useAlertSound } from "@/hooks/useAlertSound";
import { OfflineAlert, OfflineAlertItem } from "@/components/OfflineAlert";
import { InstanceSidebar } from "@/components/InstanceSidebar";
import { ContactList } from "@/components/ContactList";
import { ConversationView } from "@/components/ConversationView";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { ConfigModal } from "@/components/ConfigModal";
import { AddInstanceModal } from "@/components/AddInstanceModal";
import { LabelsModal } from "@/components/LabelsModal";
import { GlobalContactsView } from "@/components/GlobalContactsView";
import { BarChart2, MessageCircle, Tag, RefreshCw, Globe, LogOut } from "lucide-react";
import { OperationalDashV2 as OperationalDash } from "@/components/OperationalDashV2";
import { MidiaOnView } from "@/components/MidiaOnView";
import { OperationCenter } from "@/components/OperationCenter";
import { SougniLogo } from "@/components/SougniLogo";
import { DateRangePicker } from "@/components/DateRangePicker";
import { HospitalFilterButtons } from "@/components/HospitalFilter";
import { AdminMenu } from "@/components/AdminMenu";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";

interface Instance {
  id: number;
  uid: string;
  alias?: string | null;
  status: "online" | "offline" | "unknown";
  platform?: string | null;
  battery?: number | null;
  plugged?: boolean | null;
  lastCheckedAt?: Date | string | null;
  lastOnlineAt?: Date | string | null;
}
interface Contact {
  id: number;
  uid: string;
  name?: string | null;
  type: "user" | "group";
  messageCount: number;
  lastMessageAt?: Date | string | null;
  firstMessageAt?: Date | string | null;
  labelId?: number | null;
  labelName?: string | null;
  labelColor?: string | null;
  instanceId?: number;
  instanceAlias?: string | null;
  instanceUid?: string | null;
}

type CenterView = "contacts" | "analytics" | "global" | "dashboard" | "midia" | "operacao";

export default function Monitor() {
  const { data: authUser } = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const { user, can } = usePermissions();
  const { playAlert } = useAlertSound();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  // Estado inicial é "dashboard" pra usuário entrar direto na visão executiva.
  const [centerView, setCenterView] = useState<CenterView>("dashboard");
  const [offlineAlerts, setOfflineAlerts] = useState<OfflineAlertItem[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [showAddInstance, setShowAddInstance] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const instanceStatusCache = useRef<Record<number, string>>({});
  const utils = trpc.useUtils();

  const { data: instances = [], refetch: refetchInstances } = trpc.instances.list.useQuery(
    undefined,
    { refetchInterval: 60_000, refetchIntervalInBackground: true }
  );

  const { data: config } = trpc.config.get.useQuery();

  useEffect(() => {
    setLastUpdated(new Date());
    for (const inst of instances) {
      instanceStatusCache.current[inst.id] = inst.status;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances.length, instances.map(i => i.status + i.id).join(',')]);

  // Atualiza selectedInstance quando o status muda, comparando apenas o status para evitar loop
  const selectedInstanceRef = useRef<Instance | null>(null);
  selectedInstanceRef.current = selectedInstance;
  useEffect(() => {
    const sel = selectedInstanceRef.current;
    if (!sel) return;
    const updated = instances.find((i) => i.id === sel.id);
    if (!updated) return;
    // Só atualiza se algo relevante mudou (evita loop por referência)
    if (updated.status !== sel.status || updated.battery !== sel.battery || updated.alias !== sel.alias) {
      setSelectedInstance(updated as Instance);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances.map(i => i.id + i.status + i.battery + i.alias).join(',')]);

  const handleStatusChanged = useCallback(
    (data: unknown) => {
      const ev = data as {
        instanceId: number;
        uid: string;
        alias?: string;
        status: "online" | "offline" | "unknown";
        prevStatus: string;
        battery?: string;
        plugged?: string;
        platform?: string;
      };
      // Optimistic: aplica direto no cache pra refletir sem esperar o refetch
      utils.instances.list.setData(undefined, (old) =>
        old?.map((inst) =>
          inst.id === ev.instanceId
            ? {
                ...inst,
                status: ev.status,
                alias: ev.alias ?? inst.alias,
                platform: ev.platform ?? inst.platform,
                battery: ev.battery ? parseInt(ev.battery, 10) : inst.battery,
                plugged: ev.plugged !== undefined ? ev.plugged === "1" : inst.plugged,
                lastCheckedAt: new Date(),
                lastOnlineAt: ev.status === "online" ? new Date() : inst.lastOnlineAt,
              }
            : inst
        )
      );
      utils.instances.list.invalidate();
      utils.dashboard.overview.invalidate();
      utils.dashboard.realtime.invalidate();
      setLastUpdated(new Date());

      if (ev.status === "offline" && ev.prevStatus === "online") {
        playAlert();
        setOfflineAlerts((prev) => {
          if (prev.find((a) => a.instanceId === ev.instanceId)) return prev;
          return [...prev, { instanceId: ev.instanceId, uid: ev.uid, alias: ev.alias, offlineSince: new Date() }];
        });
      }
      if (ev.status === "online") {
        setOfflineAlerts((prev) => prev.filter((a) => a.instanceId !== ev.instanceId));
      }
    },
    [utils, playAlert]
  );

  // Atualizações de rotina (bateria/plugged sem mudança de status)
  const handleStatusUpdate = useCallback(
    (data: unknown) => {
      const ev = data as {
        instanceId: number;
        status?: string;
        battery?: string;
        plugged?: string;
      };
      utils.instances.list.setData(undefined, (old) =>
        old?.map((inst) =>
          inst.id === ev.instanceId
            ? {
                ...inst,
                battery: ev.battery ? parseInt(ev.battery, 10) : inst.battery,
                plugged: ev.plugged !== undefined ? ev.plugged === "1" : inst.plugged,
                lastCheckedAt: new Date(),
              }
            : inst
        )
      );
      utils.dashboard.realtime.invalidate();
      setLastUpdated(new Date());
    },
    [utils]
  );

  const handleNewMessage = useCallback(
    (data: unknown) => {
      const ev = data as { instanceId: number; contactId: number };
      utils.contacts.list.invalidate({ instanceId: ev.instanceId });
      utils.contacts.listAll.invalidate();
      utils.analytics.dailyContacts.invalidate({ instanceId: ev.instanceId });
      utils.dashboard.overview.invalidate();
      utils.dashboard.realtime.invalidate();
      if (selectedContact?.id === ev.contactId) {
        utils.messages.list.invalidate({ contactId: ev.contactId });
      }
      setLastUpdated(new Date());
    },
    [utils, selectedContact]
  );

  const handleDashboardRefresh = useCallback(() => {
    utils.dashboard.overview.invalidate();
    utils.dashboard.realtime.invalidate();
    utils.instances.list.invalidate();
    setLastUpdated(new Date());
  }, [utils]);

  useSSE({
    userId: authUser?.id,
    enabled: !!authUser?.id,
    onEvent: {
      instance_status_changed: handleStatusChanged,
      instance_status_update: handleStatusUpdate,
      new_message: handleNewMessage,
      dashboard_refresh: handleDashboardRefresh,
    },
  });

  const dismissAlert = (instanceId: number) => {
    setOfflineAlerts((prev) => prev.filter((a) => a.instanceId !== instanceId));
  };

  const handleSelectInstance = (instance: Instance) => {
    setSelectedInstance(instance);
    setSelectedContact(null);
    setCenterView("contacts");
  };

  const handleSelectDashboard = () => {
    setSelectedInstance(null);
    setSelectedContact(null);
    setCenterView("dashboard");
  };

  const handleSelectGlobal = () => {
    setSelectedInstance(null);
    setSelectedContact(null);
    setCenterView("global");
  };

  const handleSelectMidia = () => {
    setSelectedInstance(null);
    setSelectedContact(null);
    setCenterView("midia");
  };

  const handleSelectOperacao = () => {
    setSelectedInstance(null);
    setSelectedContact(null);
    setCenterView("operacao");
  };

  const handleManualRefresh = () => {
    refetchInstances();
    utils.contacts.listAll.invalidate();
    if (selectedInstance) {
      utils.contacts.list.invalidate({ instanceId: selectedInstance.id });
      utils.analytics.dailyContacts.invalidate({ instanceId: selectedInstance.id });
    }
    setLastUpdated(new Date());
  };

  // Quando um contato da visão global é clicado, precisamos da instância para abrir a conversa
  const handleSelectGlobalContact = (contact: Contact) => {
    if (contact.instanceId) {
      const inst = instances.find((i) => i.id === contact.instanceId);
      if (inst) {
        setSelectedInstance(inst as Instance);
        setSelectedContact(contact);
        setCenterView("contacts");
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 h-14 border-b border-border bg-card flex items-center px-5 gap-4">
        <SougniLogo variant="full" size="sm" />
        <span className="hidden md:inline text-xs text-muted-foreground border-l border-border pl-3 ml-1">
          Painel de canais WhatsApp
        </span>

        <div className="flex-1" />

        {/* Filtros globais — visíveis só nas telas que consomem */}
        {(centerView === "dashboard" || centerView === "global") && !selectedInstance && (
          <div className="flex items-center gap-2">
            <DateRangePicker />
            {centerView === "dashboard" && <HospitalFilterButtons />}
          </div>
        )}

        <div className="flex items-center gap-3">
          <StatusSummary instances={instances} />
          <span className="text-xs text-muted-foreground hidden sm:block tabular">
            Atualizado às {format(lastUpdated, "HH:mm:ss")}
          </span>
          <button
            onClick={handleManualRefresh}
            title="Atualizar agora"
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {can("manageLabels") && (
            <button
              onClick={() => setShowLabels(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
            >
              <Tag className="w-3.5 h-3.5" />
              Marcadores
            </button>
          )}

          {can("manageConfig") && (
            <button
              onClick={() => setShowConfig(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
            >
              Configurações
            </button>
          )}

          <AdminMenu />

          {/* Identidade do user logado */}
          {user && (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground border-l border-border pl-3 ml-2"
              title={`${user.name ?? user.username} · ${user.role === "admin" ? "Administrador" : "Usuário"}`}
            >
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background text-[10px] font-bold uppercase"
              >
                {(user.name ?? user.username ?? "?").charAt(0)}
              </span>
              <span className="hidden md:inline text-foreground font-medium">{user.name ?? user.username}</span>
              {user.role === "admin" && (
                <span className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded bg-[#DFFF00]/20 text-[#11131F] font-bold uppercase tracking-wider">
                  Admin
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => {
              if (confirm("Deseja sair do painel?")) logoutMutation.mutate();
            }}
            disabled={logoutMutation.isPending}
            title="Sair do painel"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-3 py-1.5 rounded-lg hover:bg-destructive/5 disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </header>

      {/* Corpo principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: instâncias */}
        <InstanceSidebar
          instances={instances}
          selectedInstance={selectedInstance}
          onSelect={handleSelectInstance}
          onAddInstance={() => setShowAddInstance(true)}
          offlineAlerts={offlineAlerts}
          activeView={centerView}
          onSelectDashboard={handleSelectDashboard}
          onSelectGlobal={handleSelectGlobal}
          onSelectMidia={handleSelectMidia}
          onSelectOperacao={handleSelectOperacao}
        />

        {/* Área central */}
        {/* Dashboard Operacional */}
        {centerView === "dashboard" && !selectedInstance ? (
          <div className="flex-1 overflow-hidden">
            <OperationalDash />
          </div>
        ) : centerView === "operacao" && !selectedInstance ? (
          <div className="flex-1 overflow-hidden">
            <OperationCenter />
          </div>
        ) : centerView === "midia" && !selectedInstance ? (
          <MidiaOnView />
        ) : centerView === "global" && !selectedInstance && !selectedContact ? (
          <GlobalContactsView onSelectContact={handleSelectGlobalContact} />
        ) : !selectedInstance ? (
          <EmptyState
            hasConfig={config?.hasToken ?? false}
            onConfig={() => setShowConfig(true)}
            onAdd={() => setShowAddInstance(true)}
            onGlobal={handleSelectGlobal}
          />
        ) : selectedContact ? (
          <ConversationView
            instance={selectedInstance}
            contact={selectedContact}
            onBack={() => setSelectedContact(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sub-tabs: Contatos | Analytics */}
            <div className="flex-shrink-0 flex items-center gap-1 px-5 pt-3 pb-0 border-b border-gray-100">
              <button
                onClick={() => setCenterView("contacts")}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors mr-1 ${
                  centerView === "contacts"
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Contatos
              </button>
              <button
                onClick={() => setCenterView("analytics")}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  centerView === "analytics"
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Analytics
              </button>
            </div>

            {centerView === "contacts" ? (
              <ContactList
                instance={selectedInstance}
                onSelectContact={setSelectedContact}
                onInstanceRemoved={() => {
                  setSelectedInstance(null);
                  refetchInstances();
                }}
                onInstanceRefreshed={() => refetchInstances()}
              />
            ) : (
              <AnalyticsPanel
                instanceId={selectedInstance.id}
                instanceAlias={selectedInstance.alias}
              />
            )}
          </div>
        )}
      </div>

      {/* Alertas de offline */}
      <OfflineAlert alerts={offlineAlerts} onDismiss={dismissAlert} />

      {/* Modais */}
      {showConfig && (
        <ConfigModal
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); refetchInstances(); }}
        />
      )}
      {showAddInstance && (
        <AddInstanceModal
          onClose={() => setShowAddInstance(false)}
          onAdded={() => { setShowAddInstance(false); refetchInstances(); }}
        />
      )}
      <LabelsModal open={showLabels} onClose={() => setShowLabels(false)} />
    </div>
  );
}

function StatusSummary({ instances }: { instances: Instance[] }) {
  const online = instances.filter((i) => i.status === "online").length;
  const offline = instances.filter((i) => i.status === "offline").length;
  const total = instances.length;
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        {online} online
      </span>
      {offline > 0 && (
        <span className="flex items-center gap-1.5 text-red-500 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block pulse-alert" />
          {offline} offline
        </span>
      )}
    </div>
  );
}

function EmptyState({
  hasConfig,
  onConfig,
  onAdd,
  onGlobal,
}: {
  hasConfig: boolean;
  onConfig: () => void;
  onAdd: () => void;
  onGlobal: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: "var(--sougni-lime-soft)" }}
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--sougni-ink)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-foreground mb-1.5">
        {!hasConfig ? "Configure a integração" : "Selecione um canal"}
      </h2>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        {!hasConfig
          ? "Adicione sua chave de API do provedor de mensageria para começar a monitorar seus canais WhatsApp."
          : "Escolha um canal na barra lateral para ver os contatos e conversas."}
      </p>
      <div className="flex gap-2 mt-5 flex-wrap justify-center">
        {!hasConfig && (
          <button
            onClick={onConfig}
            className="px-4 py-2 btn-primary text-sm rounded-lg"
          >
            Configurar chave
          </button>
        )}
        {hasConfig && (
          <>
            <button
              onClick={onAdd}
              className="px-4 py-2 btn-primary text-sm rounded-lg"
            >
              Adicionar canal
            </button>
            <button
              onClick={onGlobal}
              className="px-4 py-2 border border-border text-foreground text-sm rounded-lg hover:bg-muted transition-colors flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5" />
              Ver Todos os Contatos
            </button>
          </>
        )}
      </div>
    </div>
  );
}
