import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Smartphone,
  Battery,
  BatteryCharging,
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Clock,
  Globe,
  Activity,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Instance {
  id: number;
  uid: string;
  alias?: string | null;
  status: "online" | "offline" | "unknown";
  platform?: string | null;
  battery?: number | null;
  plugged?: boolean | null;
  locale?: string | null;
  lastCheckedAt?: Date | string | null;
  lastOnlineAt?: Date | string | null;
}

interface InstanceDetailPanelProps {
  instance: Instance;
  onRemoved: () => void;
  onRefreshed: () => void;
}

export function InstanceDetailPanel({
  instance,
  onRemoved,
  onRefreshed,
}: InstanceDetailPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const utils = trpc.useUtils();

  const checkMutation = trpc.instances.checkStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Status: ${data.status === "online" ? "✅ Online" : "❌ Offline"}`);
      utils.instances.list.invalidate();
      onRefreshed();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.instances.remove.useMutation({
    onSuccess: () => {
      toast.success("Instância removida.");
      utils.instances.list.invalidate();
      onRemoved();
    },
    onError: (err) => toast.error(err.message),
  });

  const BattIcon = instance.plugged ? BatteryCharging : Battery;
  const battColor =
    !instance.battery
      ? "text-gray-400"
      : instance.battery > 50
      ? "text-green-500"
      : instance.battery > 20
      ? "text-yellow-500"
      : "text-red-500";

  return (
    <div className="p-5 border-b border-gray-100">
      {/* Cabeçalho da instância */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-gray-400" />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                instance.status === "online"
                  ? "dot-online"
                  : instance.status === "offline"
                  ? "dot-offline"
                  : "dot-unknown"
              }`}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {instance.alias || instance.uid}
            </h3>
            <p className="text-xs text-gray-400">{instance.uid}</p>
          </div>
        </div>

        {/* Status badge */}
        <span
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            instance.status === "online"
              ? "bg-green-50 text-green-700"
              : instance.status === "offline"
              ? "bg-red-50 text-red-600"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {instance.status === "online" ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          {instance.status === "online"
            ? "Online"
            : instance.status === "offline"
            ? "Offline"
            : "Desconhecido"}
        </span>
      </div>

      {/* Detalhes */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {instance.battery !== null && instance.battery !== undefined && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <BattIcon className={`w-3.5 h-3.5 ${battColor}`} />
            <span className="text-xs text-gray-600">{instance.battery}%</span>
          </div>
        )}
        {instance.platform && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <Activity className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-600 capitalize">{instance.platform}</span>
          </div>
        )}
        {instance.locale && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <Globe className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-600">{instance.locale}</span>
          </div>
        )}
        {instance.lastCheckedAt && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-600">
              {format(new Date(instance.lastCheckedAt), "HH:mm", { locale: ptBR })}
            </span>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => checkMutation.mutate({ id: instance.id })}
          disabled={checkMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3 h-3 ${checkMutation.isPending ? "animate-spin" : ""}`}
          />
          Verificar
        </button>

        <div className="flex-1" />

        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Confirmar?</span>
            <button
              onClick={() => removeMutation.mutate({ id: instance.id })}
              disabled={removeMutation.isPending}
              className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              Sim
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Não
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Remover
          </button>
        )}
      </div>
    </div>
  );
}
