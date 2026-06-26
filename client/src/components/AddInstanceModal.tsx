import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { X, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { HOSPITALS, type Hospital } from "@/lib/hospitals";

interface AddInstanceModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export function AddInstanceModal({ onClose, onAdded }: AddInstanceModalProps) {
  const [uid, setUid] = useState("");
  const [alias, setAlias] = useState("");
  const [hospital, setHospital] = useState<Hospital | "">("");

  const addMutation = trpc.instances.add.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Instância adicionada! Status: ${data.status === "online" ? "✅ Online" : "❌ Offline"}`
      );
      onAdded();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid.trim()) return;
    addMutation.mutate({
      uid: uid.trim(),
      alias: alias.trim() || undefined,
      hospital: hospital || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
              <Smartphone className="w-3.5 h-3.5 text-gray-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Adicionar Instância</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Número com código do país *
            </label>
            <input
              type="text"
              value={uid}
              onChange={(e) => setUid(e.target.value.replace(/\D/g, ""))}
              placeholder="Ex: 5561999998888"
              inputMode="numeric"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Só dígitos, formato internacional sem + ou espaços. Brasil: 55 + DDD + número.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Nome / Apelido (opcional)
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ex: Suporte Principal"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Unidade (opcional)
            </label>
            <select
              value={hospital}
              onChange={(e) => setHospital(e.target.value as Hospital | "")}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors bg-white"
            >
              <option value="">Derivar do nome do canal</option>
              {HOSPITALS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Define quem pode ver este canal. Se vazio, a unidade é inferida pelo nome.
            </p>
          </div>

          <div className="rounded-xl p-3.5" style={{ background: "var(--sougni-lime-soft)", borderColor: "var(--sougni-lime-dim)" }}>
            <p className="text-xs leading-relaxed" style={{ color: "var(--sougni-ink)" }}>
              O sistema verificará o status do canal imediatamente após o cadastro.
              Certifique-se de que o número está conectado ao provedor.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!uid.trim() || addMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {addMutation.isPending ? "Verificando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
