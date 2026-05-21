import type { Response } from "express";

interface SSEClient {
  userId: number;
  res: Response;
}

const clients: SSEClient[] = [];

export function addSSEClient(userId: number, res: Response): void {
  clients.push({ userId, res });
}

export function removeSSEClient(res: Response): void {
  const idx = clients.findIndex((c) => c.res === res);
  if (idx !== -1) clients.splice(idx, 1);
}

export function broadcastToUser(userId: number, event: string, data: unknown): void {
  const userClients = clients.filter((c) => c.userId === userId);
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of userClients) {
    try {
      client.res.write(payload);
    } catch {
      // cliente desconectado
    }
  }
}

export function hasConnectedClients(): boolean {
  return clients.length > 0;
}

export function broadcastToAll(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      // cliente desconectado
    }
  }
}
