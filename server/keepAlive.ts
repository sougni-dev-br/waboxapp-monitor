/**
 * Keep-Alive: mantém o servidor sempre ativo fazendo self-ping a cada 5 minutos.
 * Isso evita que a sandbox hiberne por inatividade.
 */

const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1_000; // 5 minutos
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

async function pingHealthEndpoint(port: number): Promise<void> {
  try {
    const url = `http://localhost:${port}/api/health`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      console.log(`[KeepAlive] Ping OK — ${new Date().toISOString()}`);
    } else {
      console.warn(`[KeepAlive] Ping retornou status ${res.status}`);
    }
  } catch (err) {
    console.warn("[KeepAlive] Ping falhou:", (err as Error).message);
  }
}

export function startKeepAlive(port: number): void {
  if (keepAliveTimer) return;
  console.log(`[KeepAlive] Iniciando self-ping a cada 5 minutos (porta ${port})`);
  // Aguarda 30s antes do primeiro ping para o servidor terminar de subir
  setTimeout(() => {
    pingHealthEndpoint(port).catch(console.error);
    keepAliveTimer = setInterval(() => {
      pingHealthEndpoint(port).catch(console.error);
    }, KEEP_ALIVE_INTERVAL_MS);
  }, 30_000);
}

export function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}
