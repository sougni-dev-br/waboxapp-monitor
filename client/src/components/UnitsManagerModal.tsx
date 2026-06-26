/**
 * UnitsManagerModal — CRUD de unidades/hospitais (admin-only).
 *
 * Fonte de verdade das unidades (tabela `units`). Lista todas (ativas e
 * inativas), permite criar, renomear o label, ativar/desativar e deletar
 * (somente quando não há canais vinculados).
 */
import { useState } from "react";
import { X, Plus, Trash2, Check, Building2, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UnitsManagerModal({ open, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: units = [] } = trpc.units.list.useQuery(undefined, { enabled: open });
  const { data: linkCounts = {} } = trpc.units.linkCounts.useQuery(undefined, { enabled: open });

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", label: "" });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  function invalidate() {
    utils.units.list.invalidate();
    utils.units.listActive.invalidate();
    utils.units.linkCounts.invalidate();
  }

  const createMutation = trpc.units.create.useMutation({
    onSuccess: () => {
      toast.success("Unidade criada");
      setForm({ name: "", label: "" });
      setCreating(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.units.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.units.delete.useMutation({
    onSuccess: () => {
      toast.success("Unidade removida");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) return null;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({ name: form.name.trim().toUpperCase(), label: form.label.trim() });
  }

  function toggleActive(id: number, active: boolean) {
    updateMutation.mutate({ id, active: !active });
  }

  function saveLabel(id: number) {
    const label = editLabel.trim();
    if (!label) return;
    updateMutation.mutate({ id, label });
  }

  function handleDelete(id: number, name: string, linked: number) {
    if (linked > 0) return;
    if (!confirm(`Remover a unidade ${name}?`)) return;
    deleteMutation.mutate({ id });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DFFF00]/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#11131F]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Unidades</h2>
              <p className="text-[11px] text-muted-foreground">Hospitais/clínicas usados em canais e acessos</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Form de criação */}
          {creating ? (
            <form onSubmit={handleCreate} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Nova unidade</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="text"
                    placeholder="Slug (ex: HOPE)"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
                    autoFocus
                    required
                    className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Identificador interno (maiúsculas)</p>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Nome amigável (ex: Hope)"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Exibido na interface</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="flex-1 h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 h-9 px-3 btn-primary text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" />
                  {createMutation.isPending ? "Criando..." : "Criar unidade"}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova unidade
            </button>
          )}

          {/* Lista */}
          <div className="space-y-1.5">
            {units.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">Nenhuma unidade cadastrada.</p>
            ) : (
              units.map((u) => {
                const linked = linkCounts[u.name] ?? 0;
                return (
                  <div
                    key={u.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border ${u.active ? "bg-card" : "bg-muted/30 opacity-70"}`}
                  >
                    <div className="flex-1 min-w-0">
                      {editingId === u.id ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">{u.name}</span>
                          <input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            autoFocus
                            className="flex-1 px-2 py-1 text-sm border border-border rounded-md bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                          />
                          <button
                            onClick={() => saveLabel(u.id)}
                            disabled={updateMutation.isPending}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Salvar"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate">{u.label}</p>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{u.name}</span>
                          {!u.active && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Inativa</span>
                          )}
                          {linked > 0 && (
                            <span className="text-[10px] text-muted-foreground">· {linked} canal{linked > 1 ? "is" : ""}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {editingId !== u.id && (
                      <div className="flex items-center gap-1">
                        {/* Toggle ativo/inativo */}
                        <button
                          onClick={() => toggleActive(u.id, u.active)}
                          disabled={updateMutation.isPending}
                          title={u.active ? "Desativar" : "Ativar"}
                          className={`relative w-9 h-5 rounded-full transition-colors ${u.active ? "bg-[#11131F]" : "bg-muted-foreground/30"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${u.active ? "translate-x-4" : ""}`} />
                        </button>
                        <button
                          onClick={() => { setEditingId(u.id); setEditLabel(u.label); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                          title="Renomear label"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.name, linked)}
                          disabled={linked > 0 || deleteMutation.isPending}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
                          title={linked > 0 ? `Há ${linked} canal(is) vinculado(s) — desvincule antes de remover` : "Remover unidade"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
