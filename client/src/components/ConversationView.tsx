import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, User, Users, Image, FileText, MapPin, Mic, Video, Phone, Send, WifiOff } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatPhoneUid } from "@/lib/formatPhone";

interface Instance {
  id: number;
  uid: string;
  alias?: string | null;
  status: "online" | "offline" | "unknown";
}

interface Contact {
  id: number;
  uid: string;
  name?: string | null;
  type: "user" | "group";
  messageCount: number;
}

interface Message {
  id: number;
  direction: "in" | "out";
  type: "chat" | "image" | "video" | "audio" | "ptt" | "document" | "vcard" | "location" | "unknown";
  body: unknown;
  ack: number | null;
  dtm: number | null;
  createdAt: Date | string;
  // flag para mensagens otimistas (ainda não confirmadas pelo servidor)
  _optimistic?: boolean;
}

interface ConversationViewProps {
  instance: Instance;
  contact: Contact;
  onBack: () => void;
}

export function ConversationView({ instance, contact, onBack }: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputText, setInputText] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);

  const utils = trpc.useUtils();

  const { data: serverMessages = [], isLoading } = trpc.messages.list.useQuery(
    { contactId: contact.id, limit: 100 },
    { refetchInterval: 10_000 }
  );

  // Merge server messages with optimistic ones (remove optimistic when server confirms)
  const serverMuids = new Set(serverMessages.map((m) => (m as unknown as { cuid?: string }).cuid));
  const pendingOptimistic = optimisticMessages.filter((m) => {
    const cuid = (m as unknown as { cuid?: string }).cuid;
    return !cuid || !serverMuids.has(cuid);
  });
  const messages: Message[] = [...serverMessages as unknown as Message[], ...pendingOptimistic];

  // Auto-scroll para o final quando novas mensagens chegam
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Auto-resize do textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [inputText]);

  const sendMutation = trpc.messages.send.useMutation({
    onSuccess: () => {
      // Limpar otimistas após confirmação do servidor
      utils.messages.list.invalidate({ contactId: contact.id });
      setOptimisticMessages([]);
    },
    onError: (err) => {
      // Remover mensagem otimista em caso de erro
      setOptimisticMessages([]);
      toast.error(`Falha ao enviar: ${err.message}`);
    },
  });

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || sendMutation.isPending) return;
    if (instance.status !== "online") {
      toast.error("Instância offline. Não é possível enviar mensagens.");
      return;
    }

    // Otimistic update: adicionar mensagem imediatamente
    const optimistic: Message = {
      id: Date.now() * -1, // id negativo para não colidir
      direction: "out",
      type: "chat",
      body: { text },
      ack: 0,
      dtm: Math.floor(Date.now() / 1000),
      createdAt: new Date(),
      _optimistic: true,
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);
    setInputText("");

    sendMutation.mutate({
      instanceId: instance.id,
      contactId: contact.id,
      contactUid: contact.uid,
      text,
    });
  }, [inputText, sendMutation, instance, contact]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const isOffline = instance.status !== "online";
  const Icon = contact.type === "group" ? Users : User;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header da conversa */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
        <button
          onClick={onBack}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-gray-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate" title={contact.name ?? contact.uid}>
            {contact.name || formatPhoneUid(contact.uid)}
          </p>
          <p className="text-xs text-gray-400 truncate" title={contact.uid}>{formatPhoneUid(contact.uid)}</p>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{messages.length} mensage{messages.length === 1 ? "m" : "ns"}</span>
          {instance.status === "online" ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              offline
            </span>
          )}
        </div>
      </div>

      {/* Banner de instância offline */}
      {isOffline && (
        <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2 bg-amber-50 border-b border-amber-100">
          <WifiOff className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            Instância offline — leitura apenas. Reconecte para enviar mensagens.
          </p>
        </div>
      )}

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-gray-400">Nenhuma mensagem ainda.</p>
            <p className="text-xs text-gray-300 mt-1">
              Envie uma mensagem abaixo ou aguarde via webhook.
            </p>
          </div>
        ) : (
          <>
            {groupMessagesByDate(messages).map((group) => (
              <div key={group.date}>
                {/* Separador de data */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 px-2">{group.date}</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {group.messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? group.messages[idx - 1] : null;
                  const showAvatar = !prevMsg || prevMsg.direction !== msg.direction;

                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      showAvatar={showAvatar}
                      contactName={contact.name || contact.uid}
                      instanceAlias={instance.alias || instance.uid}
                    />
                  );
                })}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input de envio */}
      <div className="flex-shrink-0 border-t border-gray-100 px-4 py-3">
        <div
          className={`flex items-end gap-2 rounded-xl border transition-colors ${
            isOffline
              ? "border-gray-100 bg-gray-50 opacity-60"
              : "border-gray-200 bg-white focus-within:border-gray-400"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isOffline || sendMutation.isPending}
            placeholder={
              isOffline
                ? "Instância offline — envio desabilitado"
                : "Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
            }
            rows={1}
            className="flex-1 resize-none bg-transparent px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none disabled:cursor-not-allowed"
            style={{ minHeight: "40px", maxHeight: "120px" }}
          />

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isOffline || sendMutation.isPending}
            className={`flex-shrink-0 mb-2 mr-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              inputText.trim() && !isOffline && !sendMutation.isPending
                ? "bg-gray-900 text-white hover:bg-gray-700 active:scale-95"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
            title="Enviar mensagem (Enter)"
          >
            {sendMutation.isPending ? (
              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-1.5 px-1">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  showAvatar,
  contactName,
  instanceAlias,
}: {
  message: Message;
  showAvatar: boolean;
  contactName: string;
  instanceAlias: string;
}) {
  const isOut = message.direction === "out";
  const time = message.dtm
    ? format(new Date(message.dtm * 1000), "HH:mm")
    : format(new Date(message.createdAt), "HH:mm");

  return (
    <div className={`flex items-end gap-2 mb-1 ${isOut ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar placeholder */}
      <div className={`w-6 flex-shrink-0 ${showAvatar ? "visible" : "invisible"}`}>
        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
          <span className="text-gray-500 text-xs font-medium">
            {isOut ? instanceAlias[0]?.toUpperCase() : contactName[0]?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Bubble */}
      <div className={`max-w-xs lg:max-w-md xl:max-w-lg ${isOut ? "items-end" : "items-start"} flex flex-col`}>
        {showAvatar && (
          <span className={`text-xs text-gray-400 mb-1 ${isOut ? "text-right" : "text-left"}`}>
            {isOut ? instanceAlias : contactName}
          </span>
        )}
        <div
          className={`px-3.5 py-2.5 text-sm ${isOut ? "msg-out" : "msg-in"} ${
            message._optimistic ? "opacity-60" : ""
          }`}
        >
          <MessageContent message={message} />
        </div>
        <div className={`flex items-center gap-1 mt-1 ${isOut ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-xs text-gray-400">{time}</span>
          {isOut && (
            message._optimistic
              ? <span className="text-xs text-gray-300">enviando…</span>
              : <AckIcon ack={message.ack ?? 0} />
          )}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ message }: { message: Message }) {
  const body = message.body as Record<string, unknown> | null;

  switch (message.type) {
    case "chat":
      return <span className="whitespace-pre-wrap break-words">{String(body?.text ?? "")}</span>;

    case "image":
      return (
        <div className="space-y-1.5">
          {body?.url ? (
            <img
              src={String(body.url)}
              alt={String(body.caption ?? "Imagem")}
              className="rounded-lg max-w-full max-h-48 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex items-center gap-2 text-current opacity-70">
              <Image className="w-4 h-4" />
              <span className="text-xs">Imagem</span>
            </div>
          )}
          {body?.caption ? (
            <p className="text-xs opacity-80">{String(body.caption)}</p>
          ) : null}
        </div>
      );

    case "video":
      return (
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 opacity-70" />
          <span className="text-sm">
            {body?.caption ? String(body.caption) : "Vídeo"}
            {body?.duration ? (
              <span className="opacity-60 ml-1 text-xs">
                ({formatDuration(Number(body.duration))})
              </span>
            ) : null}
          </span>
        </div>
      );

    case "audio":
    case "ptt":
      return (
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 opacity-70" />
          <span className="text-sm">
            {message.type === "ptt" ? "Áudio gravado" : "Áudio"}
            {body?.duration ? (
              <span className="opacity-60 ml-1 text-xs">
                ({formatDuration(Number(body.duration))})
              </span>
            ) : null}
          </span>
        </div>
      );

    case "document":
      return (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 opacity-70" />
          <span className="text-sm truncate max-w-[200px]">
            {body?.caption ? String(body.caption) : "Documento"}
          </span>
        </div>
      );

    case "vcard":
      return (
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 opacity-70" />
          <span className="text-sm">{body?.contact ? String(body.contact) : "Contato"}</span>
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 opacity-70" />
          <span className="text-sm">
            {body?.name ? String(body.name) : "Localização"}
            {(body?.lat && body?.lng) ? (
              <a
                href={`https://maps.google.com/?q=${String(body.lat)},${String(body.lng)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 underline opacity-70 text-xs"
              >
                Ver mapa
              </a>
            ) : null}
          </span>
        </div>
      );

    default:
      return <span className="text-xs opacity-60">Mensagem não suportada</span>;
  }
}

function AckIcon({ ack }: { ack: number }) {
  if (ack === 0) return <span className="text-xs text-gray-400">○</span>;
  if (ack === 1) return <span className="text-xs text-gray-400">✓</span>;
  if (ack === 2) return <span className="text-xs text-gray-400">✓✓</span>;
  if (ack === 3) return <span className="text-xs text-blue-400">✓✓</span>;
  return null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface MessageGroup {
  date: string;
  messages: Message[];
}

function groupMessagesByDate(messages: Message[]): MessageGroup[] {
  const groups: Record<string, Message[]> = {};

  for (const msg of messages) {
    const d = msg.dtm
      ? new Date(msg.dtm * 1000)
      : new Date(msg.createdAt);
    const key = format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (!groups[key]) groups[key] = [];
    groups[key].push(msg);
  }

  return Object.entries(groups).map(([date, msgs]) => ({ date, messages: msgs }));
}
