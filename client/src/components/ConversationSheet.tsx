/**
 * ConversationSheet — drawer lateral com histórico de conversa por contato.
 *
 * Reutilizável em qualquer lugar (Operação, Dashboard, Pulso, etc).
 * Mostra mensagens IN+OUT, info do contato, info da instância (operadora).
 *
 * Usa o mesmo backend (messages.list) que a conversa principal — ou seja,
 * tudo que o webhook salva aparece aqui.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  User,
  Users,
  Image as ImageIcon,
  Mic,
  Video,
  FileText,
  MapPin,
  Phone,
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  Hash,
  Calendar,
} from "lucide-react";
import { formatPhoneUid } from "@/lib/formatPhone";

interface ConversationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Necessário pra buscar mensagens */
  contactId: number | null;
  /** Pra mostrar nome e header */
  contactName?: string | null;
  contactUid?: string;
  contactType?: "user" | "group";
  /** Da operadora que atendeu */
  instanceAlias?: string | null;
  instanceUid?: string;
  /** Metadata adicional pra header */
  meta?: { label: string; value: string }[];
}

interface MessageRow {
  id: number;
  direction: "in" | "out";
  type: "chat" | "image" | "video" | "audio" | "ptt" | "document" | "vcard" | "location" | "unknown";
  body: unknown;
  ack: number | null;
  dtm: number | null;
  createdAt: Date | string;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon, video: Video, audio: Mic, ptt: Mic,
  document: FileText, location: MapPin, vcard: Phone, unknown: MessageCircle,
};

function getMessageText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  const text = b.text ?? b.caption ?? b.url ?? "";
  return typeof text === "string" ? text : JSON.stringify(text).slice(0, 200);
}

function MessageBubble({ msg }: { msg: MessageRow }) {
  const isOut = msg.direction === "out";
  const text = getMessageText(msg.body);
  const Icon = msg.type !== "chat" ? (TYPE_ICON[msg.type] ?? MessageCircle) : null;
  const time = msg.dtm
    ? new Date(msg.dtm * 1000)
    : (typeof msg.createdAt === "string" ? new Date(msg.createdAt) : msg.createdAt);

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} px-1`}>
      <div className={`max-w-[78%] ${isOut ? "bg-[#DFFF00]/30 text-gray-900" : "bg-white text-gray-900 border border-gray-100"} rounded-2xl px-3.5 py-2 shadow-sm`}>
        {Icon && (
          <div className={`flex items-center gap-1.5 text-xs mb-1 ${isOut ? "text-gray-700" : "text-gray-500"}`}>
            <Icon className="h-3 w-3" />
            <span className="uppercase tracking-wider font-semibold text-[10px]">{msg.type}</span>
          </div>
        )}
        {text ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</p>
        ) : (
          <p className="text-xs italic text-gray-500">[sem texto]</p>
        )}
        <div className={`flex items-center gap-1 justify-end mt-1 ${isOut ? "text-gray-600" : "text-gray-400"}`}>
          <span className="text-[10px] tabular-nums">{format(time, "HH:mm")}</span>
          {isOut && (
            <span className="flex items-center">
              {msg.ack === null || msg.ack === 0 ? (
                <Loader2 className="h-3 w-3 animate-spin opacity-60" />
              ) : msg.ack === 1 ? (
                <Check className="h-3 w-3" />
              ) : msg.ack === 2 ? (
                <CheckCheck className="h-3 w-3" />
              ) : (
                <CheckCheck className="h-3 w-3 text-blue-500" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DayDivider({ date }: { date: Date }) {
  const label = format(date, "EEEE, dd 'de' MMMM", { locale: ptBR });
  return (
    <div className="flex items-center gap-3 my-3 px-1">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium px-2 py-0.5 rounded-full bg-gray-50">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

export function ConversationSheet({
  open, onOpenChange, contactId, contactName, contactUid, contactType = "user",
  instanceAlias, instanceUid, meta,
}: ConversationSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = trpc.messages.list.useQuery(
    { contactId: contactId ?? 0, limit: 200 },
    { enabled: open && contactId != null, staleTime: 10_000 }
  );

  // Auto-scroll pro fim quando abre/recebe msgs
  useEffect(() => {
    if (open && messages.length > 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "instant" });
      });
    }
  }, [open, messages.length]);

  // Agrupa por dia
  const grouped = useMemo(() => {
    const out: Array<{ date: Date; items: MessageRow[] }> = [];
    for (const m of messages as MessageRow[]) {
      const at = m.dtm
        ? new Date(m.dtm * 1000)
        : (typeof m.createdAt === "string" ? new Date(m.createdAt) : m.createdAt);
      const last = out[out.length - 1];
      if (last && isSameDay(last.date, at)) {
        last.items.push(m);
      } else {
        out.push({ date: at, items: [m] });
      }
    }
    return out;
  }, [messages]);

  const displayName = contactName?.trim() || (contactUid ? formatPhoneUid(contactUid) : "Contato");
  const totalIn = messages.filter((m: MessageRow) => m.direction === "in").length;
  const totalOut = messages.filter((m: MessageRow) => m.direction === "out").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col bg-[#FAFAF7]">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-100 bg-white shrink-0">
          <SheetTitle className="text-base font-semibold text-gray-900 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              {contactType === "group" ? <Users className="h-4 w-4 text-gray-600" /> : <User className="h-4 w-4 text-gray-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
              {contactUid && contactUid !== displayName && (
                <p className="text-[11px] text-gray-400 font-normal truncate">{formatPhoneUid(contactUid)}</p>
              )}
            </div>
          </SheetTitle>

          {/* Meta strip */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {instanceAlias && (
              <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-600 bg-gray-50 px-2 py-1 rounded-md">
                <Hash className="h-2.5 w-2.5" /> {instanceAlias}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
              <MessageCircle className="h-2.5 w-2.5" /> {totalIn}↓ · {totalOut}↑
            </span>
            {meta?.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[10px] text-gray-600 bg-gray-50 px-2 py-1 rounded-md">
                <Calendar className="h-2.5 w-2.5" /> {m.label}: <strong className="text-gray-900">{m.value}</strong>
              </span>
            ))}
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              <p className="text-xs text-gray-400">Carregando histórico…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <MessageCircle className="h-7 w-7 text-gray-200" />
              <p className="text-xs text-gray-400">Sem mensagens com esse contato</p>
              <p className="text-[10px] text-gray-400 text-center max-w-[260px] mt-1">
                Verifique se o webhook da WaboxApp está apontando para <code className="bg-gray-100 px-1 rounded">{instanceUid ?? "esta instância"}</code>.
              </p>
            </div>
          ) : (
            grouped.map((g, gi) => (
              <div key={gi}>
                <DayDivider date={g.date} />
                <div className="space-y-1.5">
                  {g.items.map((m) => <MessageBubble key={m.id} msg={m} />)}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 bg-white shrink-0">
          <p className="text-[10px] text-gray-400 text-center">
            Histórico atualizado a cada nova mensagem · Para responder, abra o contato em "Todos os Contatos"
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
