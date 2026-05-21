import { useEffect, useRef, useCallback } from "react";
import { appUrl } from "@/const";

type SSEHandler = (data: unknown) => void;

interface UseSSEOptions {
  userId: number | undefined;
  onEvent: Record<string, SSEHandler>;
  enabled?: boolean;
}

/**
 * Hook robusto para Server-Sent Events.
 * - Sem memory leaks: listeners são removidos ao fechar conexão
 * - Sem stale closures: handlers são atualizados via ref sem reconectar
 * - Reconexão automática com backoff de 5s
 * - Proteção contra conexões duplicadas via isConnectingRef
 */
export function useSSE({ userId, onEvent, enabled = true }: UseSSEOptions) {
  const esRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(onEvent);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false);
  // Mapa de listeners registrados para cleanup correto
  const listenersRef = useRef<Map<string, (e: MessageEvent) => void>>(new Map());

  // Atualiza handlers sem reconectar (evita stale closures)
  useEffect(() => {
    handlersRef.current = onEvent;
  }, [onEvent]);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (esRef.current) {
      // Remover todos os listeners antes de fechar
      const es = esRef.current;
      listenersRef.current.forEach((handler, eventName) => {
        es.removeEventListener(eventName, handler);
      });
      listenersRef.current.clear();
      es.close();
      esRef.current = null;
    }
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback(() => {
    if (!userId || !enabled || isConnectingRef.current) return;

    cleanup();
    isConnectingRef.current = true;

    const url = `${appUrl("api/sse")}?userId=${userId}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      console.log("[SSE] Connected for userId:", userId);
      isConnectingRef.current = false;

      // Registrar um handler por evento, usando ref para evitar stale closure
      const eventNames = Object.keys(handlersRef.current);
      for (const eventName of eventNames) {
        const handler = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            handlersRef.current[eventName]?.(data);
          } catch {
            // ignore parse errors
          }
        };
        listenersRef.current.set(eventName, handler);
        es.addEventListener(eventName, handler);
      }
    };

    es.onerror = () => {
      console.warn("[SSE] Connection error, reconnecting in 5s...");
      cleanup();
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log("[SSE] Attempting reconnection...");
        connect();
      }, 5000);
    };
  }, [userId, enabled, cleanup]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);
}
