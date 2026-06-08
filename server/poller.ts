import {
  getApiConfig,
  getDb,
  getInstances,
  insertStatusLog,
  updateInstanceStatus,
} from "./db";
import { broadcastToUser, hasConnectedClients } from "./sse";
import { checkInstanceStatus } from "./waboxapp";
import { users } from "../drizzle/schema";

const POLL_INTERVAL_MS = 60_000; // 60 segundos (máximo 1 minuto)
let pollerTimer: ReturnType<typeof setInterval> | null = null;

async function pollUser(user: { id: number }): Promise<void> {
  const config = await getApiConfig(user.id);
  if (!config?.token) return;

  const userInstances = await getInstances(user.id);

  // Processar todas as instâncias do usuário em paralelo
  await Promise.allSettled(
    userInstances.map(async (instance) => {
      try {
        const result = await checkInstanceStatus(config.token, instance.uid);
        const newStatus = result.success ? "online" : "offline";
        const prevStatus = instance.status;

        await updateInstanceStatus(instance.id, newStatus, {
          // Preserva o alias local (que o usuário pode ter renomeado via UI).
          // Só usa o do WaboxApp como fallback quando ainda não temos nenhum.
          alias: instance.alias ?? result.alias,
          platform: result.platform ?? instance.platform,
          battery: result.battery ? parseInt(result.battery, 10) : instance.battery,
          plugged: result.plugged !== undefined ? result.plugged === "1" : instance.plugged,
          locale: result.locale ?? instance.locale,
          hookUrl: result.hook_url ?? instance.hookUrl,
        });

        await insertStatusLog({
          instanceId: instance.id,
          status: newStatus,
          battery: result.battery ? parseInt(result.battery, 10) : null,
          plugged: result.plugged !== undefined ? result.plugged === "1" : null,
        });

        // Notificar frontend via SSE se status mudou
        if (prevStatus !== newStatus) {
          broadcastToUser(user.id, "instance_status_changed", {
            instanceId: instance.id,
            uid: instance.uid,
            alias: result.alias ?? instance.alias,
            status: newStatus,
            prevStatus,
            battery: result.battery,
            plugged: result.plugged,
            platform: result.platform,
          });
        } else {
          // Atualização de rotina (bateria, etc.)
          broadcastToUser(user.id, "instance_status_update", {
            instanceId: instance.id,
            uid: instance.uid,
            status: newStatus,
            battery: result.battery,
            plugged: result.plugged,
          });
        }
      } catch (err) {
        console.error(`[Poller] Error checking instance ${instance.uid}:`, err);
      }
    })
  );

  // Ao final de cada ciclo, sinalizar ao frontend para refrescar o dashboard
  // Só envia SSE se houver clientes conectados (evita broadcast desnecessário)
  if (hasConnectedClients()) {
    broadcastToUser(user.id, "dashboard_refresh", { ts: Date.now() });
  }
}

async function pollAllInstances(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  let allUsers: { id: number }[] = [];
  try {
    allUsers = await db.select({ id: users.id }).from(users);
  } catch {
    return;
  }

  // Processar usuários em paralelo (com limite de concorrência)
  const CONCURRENCY = 5;
  for (let i = 0; i < allUsers.length; i += CONCURRENCY) {
    const batch = allUsers.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(pollUser));
  }
}

export function startPoller(): void {
  if (pollerTimer) return;
  console.log("[Poller] Starting instance status poller (60s interval)");
  // Primeira execução imediata
  pollAllInstances().catch(console.error);
  pollerTimer = setInterval(() => {
    pollAllInstances().catch(console.error);
  }, POLL_INTERVAL_MS);
}

export function stopPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
}
