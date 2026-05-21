import { X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface OfflineAlertItem {
  instanceId: number;
  uid: string;
  alias?: string | null;
  offlineSince: Date;
}

interface OfflineAlertProps {
  alerts: OfflineAlertItem[];
  onDismiss: (instanceId: number) => void;
}

export function OfflineAlert({ alerts, onDismiss }: OfflineAlertProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.instanceId}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-3 bg-white border border-red-200 rounded-xl p-4 shadow-lg pulse-alert"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Instância Offline</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {alert.alias || alert.uid}
              </p>
              <p className="text-xs text-red-400 mt-1">
                {alert.uid} · {formatTime(alert.offlineSince)}
              </p>
            </div>
            <button
              onClick={() => onDismiss(alert.instanceId)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
