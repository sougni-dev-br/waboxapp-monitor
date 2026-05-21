import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Search, Download, MessageCircle, Users, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { InstanceDetailPanel } from "./InstanceDetailPanel";
import { FilterBar } from "./FilterBar";
import { formatPhoneUid } from "@/lib/formatPhone";

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
}

interface ContactListProps {
  instance: Instance;
  onSelectContact: (contact: Contact) => void;
  onInstanceRemoved?: () => void;
  onInstanceRefreshed?: () => void;
}

export function ContactList({
  instance,
  onSelectContact,
  onInstanceRemoved,
  onInstanceRefreshed,
}: ContactListProps) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [labelId, setLabelId] = useState<number | null | undefined>(undefined);

  const { data: contacts = [], isLoading } = trpc.contacts.list.useQuery(
    { instanceId: instance.id, dateFrom, dateTo, labelId },
    { refetchInterval: 60_000 }
  );

  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.uid.toLowerCase().includes(search.toLowerCase()) ||
          (c.name ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [contacts, search]
  );

  const hasActiveFilter = !!(dateFrom || dateTo || labelId != null);

  function handleFilterChange(f: { dateFrom?: string; dateTo?: string; labelId?: number | null }) {
    setDateFrom(f.dateFrom);
    setDateTo(f.dateTo);
    setLabelId(f.labelId ?? undefined);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <InstanceDetailPanel
        instance={instance}
        onRemoved={onInstanceRemoved ?? (() => {})}
        onRefreshed={onInstanceRefreshed ?? (() => {})}
      />

      {/* Header */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100 space-y-3">
        {/* FilterBar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <FilterBar
              dateFrom={dateFrom}
              dateTo={dateTo}
              labelId={labelId}
              onChange={handleFilterChange}
              count={filtered.length}
              total={contacts.length}
            />
          </div>
          <button
            onClick={() => exportToXLSX(filtered, instance.alias ?? instance.uid, { dateFrom, dateTo })}
            disabled={filtered.length === 0}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            XLSX
          </button>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar contato ou número..."
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
          <EmptyState
            search={search}
            hasFilter={hasActiveFilter}
            onClear={() => handleFilterChange({ dateFrom: undefined, dateTo: undefined, labelId: undefined })}
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((contact) => (
              <ContactItem key={contact.id} contact={contact} onClick={() => onSelectContact(contact)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Itens da lista ───────────────────────────────────────────────────────────

function ContactItem({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const Icon = contact.type === "group" ? Users : User;
  const msgLabel = contact.messageCount === 1 ? "msg" : "msgs";
  return (
    <button
      onClick={onClick}
      title={`${contact.name ? `${contact.name} · ` : ""}${contact.uid}`}
      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">
            {contact.name || formatPhoneUid(contact.uid)}
          </span>
          {contact.lastMessageAt && (
            <span className="text-xs text-gray-400 flex-shrink-0" title={format(new Date(contact.lastMessageAt), "dd/MM/yyyy HH:mm")}>
              {formatRelativeDate(contact.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400 truncate">{formatPhoneUid(contact.uid)}</span>
          <span className="text-gray-200">·</span>
          <span className="text-xs text-gray-400">{contact.messageCount} {msgLabel}</span>
          {contact.firstMessageAt && (
            <>
              <span className="text-gray-200">·</span>
              <span className="text-xs text-gray-400" title={`Primeira mensagem: ${format(new Date(contact.firstMessageAt), "dd/MM/yyyy HH:mm")}`}>
                Entrada: {format(new Date(contact.firstMessageAt), "dd/MM/yy", { locale: ptBR })}
              </span>
            </>
          )}
          {/* Exibe múltiplos labels se disponível, fallback para labelName legado */}
          {(contact.labels && contact.labels.length > 0) ? (
            contact.labels.map((lbl) => (
              <span key={lbl.id} className="flex items-center gap-0.5">
                <span className="text-gray-200">·</span>
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: lbl.color }}
                >
                  {lbl.name}
                </span>
              </span>
            ))
          ) : (contact.labelName && contact.labelColor) ? (
            <>
              <span className="text-gray-200">·</span>
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: contact.labelColor }}
              >
                {contact.labelName}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function EmptyState({ search, hasFilter, onClear }: { search: string; hasFilter: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
      <MessageCircle className="w-10 h-10 text-gray-200 mb-3" />
      <p className="text-sm text-gray-400">
        {search ? "Nenhum contato encontrado para esta busca." : hasFilter ? "Nenhum contato no período/marcador selecionado." : "Nenhuma conversa ainda."}
      </p>
      {hasFilter && !search && (
        <button onClick={onClear} className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="divide-y divide-gray-50">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
          <div className="flex-1">
            <div className="h-3.5 bg-gray-100 rounded animate-pulse w-32 mb-2" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-48" />
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

// ─── Exportação XLSX ──────────────────────────────────────────────────────────

async function exportToXLSX(
  contacts: Contact[],
  instanceName: string,
  filter?: { dateFrom?: string; dateTo?: string }
) {
  const XLSX = await import("xlsx").catch(() => null);
  if (!XLSX) { alert("Não foi possível carregar a biblioteca de exportação."); return; }

  const rows = contacts.map((c) => ({
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
  XLSX.utils.book_append_sheet(wb, ws, "Contatos");
  ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 20 }];

  let suffix = "";
  if (filter?.dateFrom || filter?.dateTo) {
    const from = filter.dateFrom?.replace(/-/g, "") ?? "inicio";
    const to = filter.dateTo?.replace(/-/g, "") ?? "hoje";
    suffix = `_${from}_a_${to}`;
  }

  XLSX.writeFile(wb, `contatos_${instanceName.replace(/\s+/g, "_")}${suffix}_${format(new Date(), "yyyyMMdd")}.xlsx`);
}
