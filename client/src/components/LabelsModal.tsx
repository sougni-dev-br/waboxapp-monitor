import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { X, Plus, Trash2, Tag, Zap, ChevronDown, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface LabelsModalProps {
  open: boolean;
  onClose: () => void;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#64748b", "#1a1a1a",
];

const MATCH_TYPE_LABELS: Record<string, string> = {
  contains: "Contém",
  starts_with: "Começa com",
  exact: "Exato",
};

export function LabelsModal({ open, onClose }: LabelsModalProps) {
  const [tab, setTab] = useState<"labels" | "rules">("labels");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleLabelId, setNewRuleLabelId] = useState<number | null>(null);
  const [newRuleMatchType, setNewRuleMatchType] = useState<"contains" | "starts_with" | "exact">("contains");
  const [showMatchMenu, setShowMatchMenu] = useState(false);
  const [reapplyDaysBack, setReapplyDaysBack] = useState(90);
  const [reapplyResult, setReapplyResult] = useState<{ processed: number; labeled: number } | null>(null);

  const utils = trpc.useUtils();

  const { data: labels = [] } = trpc.labels.list.useQuery();
  const { data: rules = [] } = trpc.labelRules.list.useQuery();

  const createLabel = trpc.labels.create.useMutation({
    onSuccess: () => {
      utils.labels.list.invalidate();
      setNewLabelName("");
      toast.success("Marcador criado!");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLabel = trpc.labels.delete.useMutation({
    onSuccess: () => {
      utils.labels.list.invalidate();
      utils.labelRules.list.invalidate();
      utils.contacts.list.invalidate();
      toast.success("Marcador removido.");
    },
    onError: (e) => toast.error(e.message),
  });

  const createRule = trpc.labelRules.create.useMutation({
    onSuccess: () => {
      utils.labelRules.list.invalidate();
      setNewRuleKeyword("");
      setNewRuleLabelId(null);
      toast.success("Regra criada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRule = trpc.labelRules.delete.useMutation({
    onSuccess: () => {
      utils.labelRules.list.invalidate();
      toast.success("Regra removida.");
    },
    onError: (e) => toast.error(e.message),
  });

  const reapply = trpc.labelRules.reapply.useMutation({
    onSuccess: (data) => {
      setReapplyResult(data);
      utils.contacts.list.invalidate();
      toast.success(`${data.labeled} contato(s) tabulado(s) de ${data.processed} processados.`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Marcadores e Regras</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          <button
            onClick={() => setTab("labels")}
            className={`py-3 text-xs font-semibold mr-6 border-b-2 transition-colors ${
              tab === "labels" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            Marcadores ({labels.length})
          </button>
          <button
            onClick={() => setTab("rules")}
            className={`py-3 text-xs font-semibold border-b-2 transition-colors ${
              tab === "rules" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            Regras ({rules.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "labels" ? (
            <div className="space-y-4">
              {/* Explicação */}
              <p className="text-xs text-gray-400 leading-relaxed">
                Marcadores são aplicados automaticamente quando qualquer uma das <strong>4 primeiras mensagens recebidas</strong> de um novo contato corresponde a uma regra. Um contato pode receber <strong>múltiplos marcadores</strong> se atender a várias regras.
              </p>

              {/* Form de criação */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600">Novo marcador</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nome do marcador..."
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newLabelName.trim()) {
                        createLabel.mutate({ name: newLabelName.trim(), color: newLabelColor });
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500">Cor:</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewLabelColor(color)}
                        style={{ backgroundColor: color }}
                        className={`w-5 h-5 rounded-full transition-transform ${
                          newLabelColor === color ? "scale-125 ring-2 ring-offset-1 ring-gray-300" : "hover:scale-110"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (newLabelName.trim()) {
                      createLabel.mutate({ name: newLabelName.trim(), color: newLabelColor });
                    }
                  }}
                  disabled={!newLabelName.trim() || createLabel.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {createLabel.isPending ? "Criando..." : "Criar marcador"}
                </button>
              </div>

              {/* Lista de marcadores */}
              {labels.length === 0 ? (
                <div className="text-center py-8">
                  <Tag className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Nenhum marcador criado ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {labels.map((label) => (
                    <div
                      key={label.id}
                      className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-100 rounded-xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="text-sm text-gray-800 font-medium">{label.name}</span>
                        <span className="text-xs text-gray-400">
                          {rules.filter((r) => r.labelId === label.id).length} regra(s)
                        </span>
                      </div>
                      <button
                        onClick={() => deleteLabel.mutate({ id: label.id })}
                        disabled={deleteLabel.isPending}
                        className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Explicação */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Quando um <strong>novo contato</strong> envia mensagem, o sistema verifica as regras nas <strong>4 primeiras mensagens recebidas</strong> e aplica <strong>todos os marcadores</strong> cujas regras corresponderem.
                  </p>
                </div>
              </div>

              {/* Form de criação */}
              {labels.length === 0 ? (
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-400">Crie marcadores primeiro para poder adicionar regras.</p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-600">Nova regra</p>

                  {/* Keyword */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Palavra-chave na mensagem</label>
                    <input
                      type="text"
                      placeholder="ex: oi, olá, preço, orçamento..."
                      value={newRuleKeyword}
                      onChange={(e) => setNewRuleKeyword(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 transition-colors"
                    />
                  </div>

                  {/* Tipo de match */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Tipo de correspondência</label>
                    <div className="relative">
                      <button
                        onClick={() => setShowMatchMenu(!showMatchMenu)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                      >
                        <span className="text-gray-700">{MATCH_TYPE_LABELS[newRuleMatchType]}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      {showMatchMenu && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-10 overflow-hidden">
                          {(["contains", "starts_with", "exact"] as const).map((type) => (
                            <button
                              key={type}
                              onClick={() => { setNewRuleMatchType(type); setShowMatchMenu(false); }}
                              className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${newRuleMatchType === type ? "text-gray-900 font-medium" : "text-gray-600"}`}
                            >
                              <span className="font-medium">{MATCH_TYPE_LABELS[type]}</span>
                              <span className="text-xs text-gray-400 ml-2">
                                {type === "contains" && "— mensagem contém a palavra"}
                                {type === "starts_with" && "— mensagem começa com a palavra"}
                                {type === "exact" && "— mensagem é exatamente a palavra"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Label */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Aplicar marcador</label>
                    <div className="flex flex-wrap gap-2">
                      {labels.map((label) => (
                        <button
                          key={label.id}
                          onClick={() => setNewRuleLabelId(label.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            newRuleLabelId === label.id
                              ? "border-transparent text-white shadow-sm"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                          style={newRuleLabelId === label.id ? { backgroundColor: label.color } : {}}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: newRuleLabelId === label.id ? "white" : label.color }}
                          />
                          {label.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (newRuleKeyword.trim() && newRuleLabelId) {
                        createRule.mutate({
                          keyword: newRuleKeyword.trim(),
                          labelId: newRuleLabelId,
                          matchType: newRuleMatchType,
                        });
                      }
                    }}
                    disabled={!newRuleKeyword.trim() || !newRuleLabelId || createRule.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {createRule.isPending ? "Criando..." : "Criar regra"}
                  </button>
                </div>
              )}

              {/* Reaplicar Regras retroativamente */}
              {rules.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-indigo-800">Reaplicar Regras Retroativamente</p>
                  </div>
                  <p className="text-xs text-indigo-600 leading-relaxed">
                    Processa contatos <strong>sem tabulação</strong> e aplica as regras nas 4 primeiras mensagens de cada um. Útil para corrigir contatos que chegaram antes das regras serem configuradas.
                  </p>

                  {/* Seletor de período */}
                  <div>
                    <label className="text-xs text-indigo-700 mb-1.5 block font-medium">Período a processar</label>
                    <div className="flex gap-2 flex-wrap">
                      {[7, 30, 90, 180, 365].map((days) => (
                        <button
                          key={days}
                          onClick={() => { setReapplyDaysBack(days); setReapplyResult(null); }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                            reapplyDaysBack === days
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400"
                          }`}
                        >
                          {days === 365 ? "1 ano" : `${days}d`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resultado anterior */}
                  {reapplyResult && (
                    <div className="flex items-center gap-2 bg-white border border-indigo-100 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <p className="text-xs text-gray-700">
                        <strong>{reapplyResult.labeled}</strong> contato(s) tabulado(s) de{" "}
                        <strong>{reapplyResult.processed}</strong> processados.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setReapplyResult(null);
                      reapply.mutate({ daysBack: reapplyDaysBack });
                    }}
                    disabled={reapply.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reapply.isPending ? "animate-spin" : ""}`} />
                    {reapply.isPending
                      ? "Processando contatos..."
                      : `Reaplicar nos últimos ${reapplyDaysBack === 365 ? "365" : reapplyDaysBack} dias`}
                  </button>
                </div>
              )}

              {/* Lista de regras */}
              {rules.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Nenhuma regra criada ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Todas as regras são verificadas — o contato recebe cada marcador cuja regra casar.</p>
                  {rules.map((rule, index) => {
                    const label = labels.find((l) => l.id === rule.labelId);
                    return (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-100 rounded-xl"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs text-gray-400 font-mono w-4 flex-shrink-0">{index + 1}.</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500">{MATCH_TYPE_LABELS[rule.matchType]}:</span>
                              <span className="text-sm font-medium text-gray-800 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                                "{rule.keyword}"
                              </span>
                            </div>
                            {label && (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-xs text-gray-400">→ Aplica:</span>
                                <span
                                  className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                                  style={{ backgroundColor: label.color }}
                                >
                                  {label.name}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteRule.mutate({ id: rule.id })}
                          disabled={deleteRule.isPending}
                          className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
