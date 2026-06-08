/**
 * GlobalContactsView — visão consolidada de todos os contatos de todas as instâncias,
 * com filtros de data (DD/MM/AAAA) e marcadores.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Search, Download, MessageCircle, Users, User, Globe, Tag, ChevronDown, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneUid } from "@/lib/formatPhone";
import { useDateRange } from "@/contexts/DateRangeContext";
import { ContactLabelsEditor } from "./ContactLabelsEditor";

interface ContactLabelItem {
  id: number;
  name: string;
  color: string;
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
  labels?: ContactLabelItem[];
  instanceId: number;
  instanceAlias?: string | null;
  instanceUid?: string | null;
}

interface GlobalContactsViewProps {
  onSelectContact: (contact: Contact) => void;
}

export function GlobalContactsView({ onSelectContact }: GlobalContactsViewProps) {
  const [search, setSearch] = useState("");
  const [labelId, setLabelId] = useState<number | null | undefined>(undefined);
  const { fromISO, toISO, preset } = useDateRange();

  const { data: contacts = [], isLoading } = trpc.contacts.listAll.useQuery(
    { dateFrom: fromISO, dateTo: toISO, labelId },
    { refetchInterval: 60_000 }
  );

  const { data: labels = [] } = trpc.labels.list.useQuery(undefined, { refetchInterval: 60_000 });
  const selectedLabel = labels.find((l) => l.id === labelId);
  const [labelOpen, setLabelOpen] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (labelRef.current && !labelRef.current.contains(e.target as Node)) setLabelOpen(false);
    }
    if (labelOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [labelOpen]);

  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.uid.toLowerCase().includes(search.toLowerCase()) ||
          (c.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (c.instanceAlias ?? c.instanceUid ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [contacts, search]
  );

  const hasActiveFilter = labelId != null || preset !== "30d";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Todos os Contatos</h2>
            <span className="text-xs text-gray-400">— todas as instâncias</span>
          </div>
          <button
            onClick={() => exportToXLSX(filtered, { dateFrom: fromISO, dateTo: toISO })}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar XLSX
          </button>
        </div>

        {/* Filtros — data vem do seletor global no header. Aqui só label. */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative" ref={labelRef}>
            <button
              onClick={() => setLabelOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                labelId != null
                  ? "bg-gray-900 text-white border-gray-900"
                  : "text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {selectedLabel ? (
                <>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: selectedLabel.color ?? "#888" }}
                  />
                  {selectedLabel.name}
                </>
              ) : (
                <>
                  <Tag className="w-3.5 h-3.5" />
                  Marcador
                </>
              )}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {labelOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]">
                <button
                  onClick={() => { setLabelId(undefined); setLabelOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                    labelId == null ? "font-semibold text-gray-900" : "text-gray-600"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  Todos os marcadores
                </button>
                {labels.length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-400 italic">Nenhum marcador criado</p>
                )}
                {labels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => { setLabelId(label.id); setLabelOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                      labelId === label.id ? "font-semibold text-gray-900" : "text-gray-600"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color ?? "#888" }} />
                    {label.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {labelId != null && (
            <button
              onClick={() => setLabelId(undefined)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg transition-colors"
            >
              <X className="w-3 h-3" />
              Limpar
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400 tabular">
            {filtered.length} {filtered.length === 1 ? "lead" : "leads"} no período
            {filtered.length !== contacts.length && (
              <span className="text-gray-300 ml-1">de {contacts.length}</span>
            )}
          </span>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por número, nome ou instância..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
            <MessageCircle className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">
              {search
                ? "Nenhum contato encontrado para esta busca."
                : hasActiveFilter
                ? "Nenhum contato no período/marcador selecionado."
                : "Nenhuma conversa em nenhuma instância ainda."}
            </p>
            {labelId != null && !search && (
              <button
                onClick={() => setLabelId(undefined)}
                className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Limpar marcador
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((contact) => (
              <GlobalContactItem
                key={`${contact.instanceId}-${contact.id}`}
                contact={contact}
                onClick={() => onSelectContact(contact)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GlobalContactItem({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const Icon = contact.type === "group" ? Users : User;
  const instanceLabel = contact.instanceAlias || contact.instanceUid || `#${contact.instanceId}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="w-full flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors text-left cursor-pointer"
    >
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 truncate" title={contact.name ?? contact.uid}>
            {contact.name || formatPhoneUid(contact.uid)}
          </span>
          {contact.lastMessageAt && (
            <span className="text-xs text-gray-400 flex-shrink-0" title={format(new Date(contact.lastMessageAt), "dd/MM/yyyy HH:mm")}>
              {formatRelativeDate(contact.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {/* Instância de origem */}
          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium" title={instanceLabel}>
            {instanceLabel}
          </span>
          <span className="text-xs text-gray-400 truncate" title={contact.uid}>{formatPhoneUid(contact.uid)}</span>
          <span className="text-gray-200">·</span>
          <span className="text-xs text-gray-400">{contact.messageCount} msgs</span>
          {contact.firstMessageAt && (
            <>
              <span className="text-gray-200">·</span>
              <span className="text-xs text-gray-400">
                Entrada: {format(new Date(contact.firstMessageAt), "dd/MM/yy", { locale: ptBR })}
              </span>
            </>
          )}
          {/* Marcadores aplicados + botão "+ Marcar" para multi-select */}
          <span className="text-gray-200">·</span>
          {(() => {
            const applied =
              contact.labels && contact.labels.length > 0
                ? contact.labels
                : contact.labelName && contact.labelColor && contact.labelId
                ? [{ id: contact.labelId, name: contact.labelName, color: contact.labelColor }]
                : [];
            return (
              <ContactLabelsEditor
                contactId={contact.id}
                appliedLabels={applied}
                compact={applied.length === 0}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="divide-y divide-gray-50">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-6 py-3.5">
          <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
          <div className="flex-1">
            <div className="h-3.5 bg-gray-100 rounded animate-pulse w-40 mb-2" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return format(d, "HH:mm");
  if (days === 1) return "Ontem";
  if (days < 7) return format(d, "EEE", { locale: ptBR });
  return format(d, "dd/MM/yy");
}

async function exportToXLSX(
  contacts: Contact[],
  filter?: { dateFrom?: string; dateTo?: string }
) {
  const XLSX = await import("xlsx").catch(() => null);
  if (!XLSX) { alert("Não foi possível carregar a biblioteca de exportação."); return; }

  const rows = contacts.map((c) => ({
    Instância: c.instanceAlias || c.instanceUid || `#${c.instanceId}`,
    Número: c.uid,
    Nome: c.name ?? "",
    Tipo: c.type === "group" ? "Grupo" : "Usuário",
    Marcador: c.labelName ?? "",
    "Primeira Mensagem (Entrada)": c.firstMessageAt ? format(new Date(c.firstMessageAt), "dd/MM/yyyy HH:mm") : "",
    "Última Mensagem": c.lastMessageAt ? format(new Date(c.lastMessageAt), "dd/MM/yyyy HH:mm") : "",
    "Total de Mensagens": c.messageCount,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Todos os Contatos");
  ws["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 20 }];

  let suffix = "";
  if (filter?.dateFrom || filter?.dateTo) {
    const from = filter.dateFrom?.replace(/-/g, "") ?? "inicio";
    const to = filter.dateTo?.replace(/-/g, "") ?? "hoje";
    suffix = `_${from}_a_${to}`;
  }

  XLSX.writeFile(wb, `todos_contatos${suffix}_${format(new Date(), "yyyyMMdd")}.xlsx`);
}
