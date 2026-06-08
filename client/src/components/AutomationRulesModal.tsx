/**
 * AutomationRulesModal — CRUD de regras de automação (admin-only).
 *
 * Permite criar regras que disparam mensagens automáticas baseadas em:
 *   • trigger (evento que dispara)
 *   • hospital (HOPE/CBV/HOLHOS/Todos)
 *   • keywords (palavras-chave / objeções do lead)
 *   • delay em minutos comerciais
 *   • mensagem (suporta {{nome}}, {{hospital}}, {{procedimento}})
 */
import { useState } from "react";
import { X, Plus, Trash2, Zap, Check, Power, PowerOff, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Trigger =
  | "lead_in"
  | "lead_no_reply_5min"
  | "lead_no_reply_30min"
  | "lead_read_no_reply"
  | "lead_keyword_match";

const TRIGGER_LABELS: Record<Trigger, { title: string; desc: string }> = {
  lead_in: { title: "Novo lead chegou", desc: "Dispara assim que um lead manda 1ª mensagem" },
  lead_no_reply_5min: { title: "Sem resposta há 5 min", desc: "Atendente não respondeu em 5 min comerciais" },
  lead_no_reply_30min: { title: "Sem resposta há 30 min", desc: "Atendente não respondeu em 30 min comerciais" },
  lead_read_no_reply: { title: "Lido sem resposta", desc: "Atendente leu mas não respondeu" },
  lead_keyword_match: { title: "Palavra-chave detectada", desc: "Lead mencionou alguma das keywords" },
};

const HOSPITALS = ["", "HOPE", "CBV", "HOLHOS"];

interface RuleForm {
  id?: number;
  name: string;
  trigger: Trigger;
  hospital: string;
  keywords: string;
  delayMinutes: number;
  message: string;
  active: boolean;
}

const DEFAULT_FORM: RuleForm = {
  name: "",
  trigger: "lead_in",
  hospital: "",
  keywords: "",
  delayMinutes: 0,
  message: "Olá {{nome}}! Vi que você demonstrou interesse em {{procedimento}} — posso te ajudar?",
  active: true,
};

export function AutomationRulesModal({ open, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: rules = [] } = trpc.admin.automation.list.useQuery(undefined, {
    enabled: open,
  });

  const [editing, setEditing] = useState<RuleForm | null>(null);

  const upsertMutation = trpc.admin.automation.upsert.useMutation({
    onSuccess: () => {
      toast.success(editing?.id ? "Regra atualizada" : "Regra criada");
      setEditing(null);
      utils.admin.automation.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.admin.automation.delete.useMutation({
    onSuccess: () => {
      toast.success("Regra removida");
      utils.admin.automation.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    upsertMutation.mutate({
      id: editing.id,
      name: editing.name.trim(),
      trigger: editing.trigger,
      hospital: editing.hospital || null,
      keywords: editing.keywords.trim() || null,
      delayMinutes: editing.delayMinutes,
      message: editing.message.trim(),
      active: editing.active,
    });
  }

  function handleDelete(id: number) {
    if (!confirm("Remover esta regra?")) return;
    deleteMutation.mutate({ id });
  }

  function handleToggle(rule: typeof rules[number]) {
    upsertMutation.mutate({
      id: rule.id,
      name: rule.name,
      trigger: rule.trigger as Trigger,
      hospital: rule.hospital,
      keywords: rule.keywords,
      delayMinutes: rule.delayMinutes,
      message: rule.message,
      active: !rule.active,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DFFF00]/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#11131F]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Automação</h2>
              <p className="text-[11px] text-muted-foreground">
                Triggers e mensagens automáticas por hospital
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {editing ? (
            <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">
                {editing.id ? "Editar regra" : "Nova regra"}
              </p>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                  placeholder="Ex.: Saudação automática HOPE"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Trigger
                  </label>
                  <select
                    value={editing.trigger}
                    onChange={(e) => setEditing({ ...editing, trigger: e.target.value as Trigger })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40"
                  >
                    {(Object.keys(TRIGGER_LABELS) as Trigger[]).map((t) => (
                      <option key={t} value={t}>
                        {TRIGGER_LABELS[t].title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Hospital
                  </label>
                  <select
                    value={editing.hospital}
                    onChange={(e) => setEditing({ ...editing, hospital: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40"
                  >
                    {HOSPITALS.map((h) => (
                      <option key={h} value={h}>
                        {h || "Todos"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Delay (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={editing.delayMinutes}
                    onChange={(e) => setEditing({ ...editing, delayMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 tabular"
                  />
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground -mt-1">
                {TRIGGER_LABELS[editing.trigger].desc}
              </p>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Keywords / objeções (uma por linha)
                </label>
                <textarea
                  value={editing.keywords}
                  onChange={(e) => setEditing({ ...editing, keywords: e.target.value })}
                  rows={3}
                  placeholder="preço&#10;caro&#10;não tenho condições&#10;particular"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40 resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Usado quando o trigger é "Palavra-chave detectada". Match parcial, case-insensitive.
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Mensagem
                </label>
                <textarea
                  value={editing.message}
                  onChange={(e) => setEditing({ ...editing, message: e.target.value })}
                  required
                  rows={4}
                  placeholder="Olá {{nome}}! ..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40 resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Variáveis disponíveis: <code className="bg-muted px-1 rounded">{`{{nome}}`}</code>,{" "}
                  <code className="bg-muted px-1 rounded">{`{{hospital}}`}</code>,{" "}
                  <code className="bg-muted px-1 rounded">{`{{procedimento}}`}</code>
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-foreground">Ativa</span>
              </label>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={upsertMutation.isPending}
                  className="flex-1 h-9 px-3 btn-primary text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" />
                  {upsertMutation.isPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setEditing(DEFAULT_FORM)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova regra de automação
            </button>
          )}

          {/* Lista de regras */}
          <div className="space-y-1.5">
            {rules.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">
                Nenhuma regra criada ainda.
              </p>
            ) : (
              rules.map((r) => (
                <div
                  key={r.id}
                  className={`px-3 py-2.5 rounded-xl border border-border ${
                    r.active ? "bg-card" : "bg-muted/30 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#11131F] text-white text-[10px] font-bold uppercase tracking-wider">
                          {r.hospital || "TODOS"}
                        </span>
                        {!r.active && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Inativa
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {TRIGGER_LABELS[r.trigger as Trigger]?.title ?? r.trigger}
                        {r.delayMinutes > 0 && ` · +${r.delayMinutes}min`}
                      </p>
                      <p className="text-xs text-foreground/80 mt-1.5 line-clamp-2">
                        {r.message}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleToggle(r)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          r.active
                            ? "text-emerald-600 hover:bg-emerald-50"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                        title={r.active ? "Desativar" : "Ativar"}
                      >
                        {r.active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setEditing({
                          id: r.id,
                          name: r.name,
                          trigger: r.trigger as Trigger,
                          hospital: r.hospital ?? "",
                          keywords: r.keywords ?? "",
                          delayMinutes: r.delayMinutes,
                          message: r.message,
                          active: r.active,
                        })}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
                        title="Remover"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
