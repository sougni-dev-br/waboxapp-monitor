/**
 * Modal pra renomear o canal (alias) de uma instância.
 * Acionado pelo botão "lápis" no hover do item da sidebar.
 */
import { useEffect, useState } from "react";
import { Pencil, X, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatPhoneUid } from "@/lib/formatPhone";
import { FALLBACK_UNIT_OPTIONS } from "@/lib/hospitals";

interface InstanceAliasEditorProps {
  instance: { id: number; uid: string; alias?: string | null; hospital?: string | null };
  open: boolean;
  onClose: () => void;
  onUpdated?: (newAlias: string) => void;
}

export function InstanceAliasEditor({ instance, open, onClose, onUpdated }: InstanceAliasEditorProps) {
  const [alias, setAlias] = useState(instance.alias ?? "");
  const [hospital, setHospital] = useState<string>(instance.hospital ?? "");
  const { data: units } = trpc.units.listActive.useQuery(undefined, { staleTime: 5 * 60_000 });
  const baseUnits = units && units.length ? units : FALLBACK_UNIT_OPTIONS;
  // Garante que a unidade atual (mesmo inativa) continue selecionável.
  const unitOptions =
    instance.hospital && !baseUnits.some((u) => u.name === instance.hospital)
      ? [...baseUnits, { id: -999, name: instance.hospital, label: `${instance.hospital} (inativa)`, active: false }]
      : baseUnits;
  const utils = trpc.useUtils();
  const mutation = trpc.instances.update.useMutation({
    onSuccess: () => {
      toast.success("Canal atualizado");
      utils.instances.list.invalidate();
      onUpdated?.(alias.trim());
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Falha ao salvar");
    },
  });

  // Reset valores quando o modal abre
  useEffect(() => {
    if (open) {
      setAlias(instance.alias ?? "");
      setHospital(instance.hospital ?? "");
    }
  }, [open, instance.alias, instance.hospital]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = alias.trim();
    if (!trimmed) return;
    const aliasUnchanged = trimmed === (instance.alias ?? "");
    const hospitalUnchanged = (hospital || null) === (instance.hospital ?? null);
    if (aliasUnchanged && hospitalUnchanged) {
      onClose();
      return;
    }
    mutation.mutate({
      id: instance.id,
      alias: aliasUnchanged ? undefined : trimmed,
      hospital: hospitalUnchanged ? undefined : (hospital || null),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DFFF00]/30 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-[#11131F]" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Renomear canal</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Número: <span className="font-mono text-foreground">{formatPhoneUid(instance.uid)}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="alias" className="block text-xs font-semibold text-foreground mb-1.5">
              Nome do canal
            </label>
            <input
              id="alias"
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              autoFocus
              placeholder="Ex.: HOPE - Catarata"
              maxLength={128}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-lg outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
            />
          </div>

          <div>
            <label htmlFor="hospital" className="block text-xs font-semibold text-foreground mb-1.5">
              Unidade
            </label>
            <select
              id="hospital"
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-lg outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
            >
              <option value="">Derivar do nome do canal</option>
              {unitOptions.map((u) => (
                <option key={u.name} value={u.name}>{u.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Controla quais usuários enxergam este canal.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !alias.trim()}
              className="flex-1 h-10 px-4 btn-primary text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Salvar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
