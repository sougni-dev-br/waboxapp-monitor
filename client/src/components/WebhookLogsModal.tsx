/**
 * WebhookLogsModal — visualização (admin) dos webhooks recebidos do WaboxApp.
 * Lista paginada + popup de detalhe com o payload bruto em JSON.
 */
import { useState } from "react";
import { X, Radio, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface WebhookLogRow {
  id: number;
  receivedAt: string | Date;
  event: string | null;
  instanceUid: string | null;
  contactUid: string | null;
  contactName: string | null;
  contactType: string | null;
  rawPayload: string;
}

function eventBadgeClass(event: string | null): string {
  if (event === "message") return "bg-emerald-100 text-emerald-700";
  if (event === "ack") return "bg-blue-100 text-blue-700";
  return "bg-muted text-muted-foreground";
}

function fmtDate(d: string | Date): string {
  try {
    return format(new Date(d), "dd/MM/yy HH:mm:ss");
  } catch {
    return String(d);
  }
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function WebhookLogsModal({ open, onClose }: Props) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WebhookLogRow | null>(null);

  const { data: enabledData } = trpc.webhookLogs.isEnabled.useQuery(undefined, { enabled: open });
  const { data, isLoading } = trpc.webhookLogs.list.useQuery(
    { page, limit: 50 },
    { enabled: open },
  );

  if (!open) return null;

  const rows = (data?.rows ?? []) as WebhookLogRow[];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const enabled = enabledData?.enabled ?? false;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DFFF00]/30 flex items-center justify-center">
              <Radio className="w-4 h-4 text-[#11131F]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Webhook Logs</h2>
              <p className="text-[11px] text-muted-foreground">{total} registro(s) · webhooks recebidos do WaboxApp</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {!enabled && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Log de webhooks está <strong>desativado</strong>. Ative a variável <code className="font-mono">WEBHOOK_LOG=true</code> no Render para registrar novos webhooks. Registros antigos (se houver) continuam visíveis abaixo.
            </div>
          )}

          {isLoading ? (
            <p className="text-center text-xs text-muted-foreground py-8">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">Nenhum webhook registrado.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Data/Hora</th>
                    <th className="px-3 py-2 font-semibold">Event</th>
                    <th className="px-3 py-2 font-semibold">Instância</th>
                    <th className="px-3 py-2 font-semibold">Contato (uid)</th>
                    <th className="px-3 py-2 font-semibold">Nome</th>
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 tabular whitespace-nowrap text-foreground">{fmtDate(r.receivedAt)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${eventBadgeClass(r.event)}`}>
                          {r.event ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{r.instanceUid ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{r.contactUid ?? "—"}</td>
                      <td className="px-3 py-2 text-foreground truncate max-w-[160px]">{r.contactName ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.contactType ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border">
          <span className="text-[11px] text-muted-foreground">Página {data?.page ?? page} de {totalPages}</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próximo <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Popup de detalhe */}
      {selected && (
        <WebhookLogDetail row={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function WebhookLogDetail({ row, onClose }: { row: WebhookLogRow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const json = prettyJson(row.rawPayload);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success("Payload copiado");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Webhook #{row.id}</h2>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Recebido em" value={fmtDate(row.receivedAt)} />
            <Field label="Event" value={row.event ?? "—"} />
            <Field label="Instância" value={row.instanceUid ?? "—"} mono />
            <Field label="Contato (uid)" value={row.contactUid ?? "—"} mono />
            <Field label="Nome do contato" value={row.contactName ?? "—"} />
            <Field label="Tipo" value={row.contactType ?? "—"} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-foreground">Payload bruto</p>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                Copiar payload
              </button>
            </div>
            <pre className="text-[11px] leading-relaxed font-mono bg-[#11131F] text-[#DFFF00]/90 rounded-xl p-4 overflow-x-auto max-h-[50vh] whitespace-pre">
              {json}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-foreground break-all ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
