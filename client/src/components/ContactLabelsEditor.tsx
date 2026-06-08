/**
 * Popover de edição multi-select de marcadores para um contato.
 *
 * Usado nas listas (ContactList, GlobalContactsView) — clique no botão "+"
 * (ou nos badges já aplicados) abre uma seleção checkbox com todos os
 * marcadores; o usuário marca/desmarca quantos quiser e salva.
 *
 * Backend: trpc.contacts.setLabels({contactId, labelIds[]}) — sobrescreve
 * atomicamente o conjunto. Idempotente.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface AppliedLabel {
  id: number;
  name: string;
  color: string;
}

interface ContactLabelsEditorProps {
  contactId: number;
  appliedLabels: AppliedLabel[];
  /** Compacto = apenas botão "+", sem mostrar badges aplicados */
  compact?: boolean;
}

export function ContactLabelsEditor({ contactId, appliedLabels, compact = false }: ContactLabelsEditorProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set(appliedLabels.map((l) => l.id)));
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const utils = trpc.useUtils();
  const { data: allLabels = [] } = trpc.labels.list.useQuery(undefined, { staleTime: 60_000 });

  const setLabelsMutation = trpc.contacts.setLabels.useMutation({
    onSuccess: () => {
      utils.contacts.list.invalidate();
      utils.contacts.listAll.invalidate();
      setOpen(false);
      toast.success("Marcadores atualizados.");
    },
    onError: (e) => toast.error(e.message),
  });

  // Sincroniza estado quando appliedLabels muda externamente
  useEffect(() => {
    setSelected(new Set(appliedLabels.map((l) => l.id)));
  }, [appliedLabels]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function toggle(labelId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });
  }

  function save() {
    setLabelsMutation.mutate({ contactId, labelIds: Array.from(selected) });
  }

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setSelected(new Set(appliedLabels.map((l) => l.id)));
    setOpen((v) => !v);
  }

  return (
    <span className="relative inline-flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {!compact &&
        appliedLabels.map((lbl) => (
          <span
            key={lbl.id}
            className="text-xs font-medium px-1.5 py-0.5 rounded-full text-white"
            style={{ backgroundColor: lbl.color }}
          >
            {lbl.name}
          </span>
        ))}

      <button
        ref={triggerRef}
        onClick={handleOpen}
        title="Adicionar/remover marcadores"
        className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-gray-800 border border-dashed border-gray-300 hover:border-gray-500 rounded-full px-1.5 py-0.5 transition-colors"
      >
        <Plus className="w-3 h-3" />
        {compact ? "Marcador" : "Marcar"}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 top-full mt-1 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">Marcadores</p>
            <button onClick={() => setOpen(false)} className="p-0.5 text-gray-400 hover:text-gray-700 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {allLabels.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 text-center">
              Nenhum marcador criado.
              <br />
              Crie em <span className="font-medium">Marcadores</span> (topo).
            </p>
          ) : (
            <>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {allLabels.map((lbl) => {
                  const isSelected = selected.has(lbl.id);
                  return (
                    <button
                      key={lbl.id}
                      onClick={() => toggle(lbl.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                        isSelected ? "bg-gray-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? "border-gray-900 bg-gray-900" : "border-gray-300 bg-white"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span
                        className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: lbl.color }}
                      />
                      <span className="text-xs text-gray-800 truncate">{lbl.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                <span className="text-[11px] text-gray-400">{selected.size} selecionado(s)</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={save}
                    disabled={setLabelsMutation.isPending}
                    className="px-2.5 py-1 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                  >
                    {setLabelsMutation.isPending ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
