import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { addSSEClient, broadcastToUser, removeSSEClient } from "../sse";
import { startPoller } from "../poller";
import { startKeepAlive } from "../keepAlive";
import { ensureAuthSchema } from "./migrate";
import {
  applyLabelsToContact,
  contactHasLabel,
  getDb,
  waitForDb,
  getFirstInboundMessages,
  getInboundMessageCount,
  getInstanceByUid,
  getInstances,
  insertMessage,
  matchAllLabelsForMessages,
  upsertContact,
} from "../db";
import { apiConfigs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Confiar no proxy reverso (Apache/Nginx do SiteGround)
  // Necessário para que req.protocol/req.ip reflitam X-Forwarded-* corretamente
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ─── Health check (keep-alive) ────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // ─── Export pra PIPELINE (lido pelo Apps Script via UrlFetchApp) ──────────
  //
  // Dados retornados: telefone (uid WhatsApp) e nome (público nas conversas).
  // Não há campos sensíveis (sem mensagens, sem dados financeiros, sem
  // endereço/CPF). Endpoint é read-only e idempotente.
  app.get("/api/export/leads-for-pipeline", async (_req, res) => {
    try {
      const { getInstances, getLeadsWithAggregatedText } = await import("../db");
      const allInstances = await getInstances(1); // OWNER_ID
      const instanceIds = allInstances.map((i) => i.id);
      const leads = await getLeadsWithAggregatedText(instanceIds);

      const REFRATIVA_REGEX =
        /\b(refrativa|lasik|prk|miopia|m[ií]ope|astigmatismo|presbiopia|hipermetropia|grau\s+(no|nos)\s+olho)\b/i;

      const out = leads.map((lead) => {
        const alias = (lead.instanceAlias ?? "").toUpperCase();
        const hospital = /\bHOPE\b/i.test(alias)
          ? "HOPE"
          : /\bCBV\b/i.test(alias)
            ? "CBV"
            : "HOLHOS";
        const procedure = REFRATIVA_REGEX.test(lead.allText) ? "Refrativa" : "Catarata";
        const phone = lead.uid.replace(/@(c|g)\.us$/, "").replace(/[^0-9]/g, "");
        const d = lead.createdAt;
        const dateEntered = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return [dateEntered, phone, lead.name ?? "", hospital, procedure];
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({ total: out.length, rows: out });
    } catch (err) {
      console.error("[export pipeline]", err);
      res.status(500).json({ error: "Falha ao processar leads" });
    }
  });

  // ─── SSE: push de status em tempo real para o frontend ─────────────────────
  app.get("/api/sse", (req, res) => {
    const userId = parseInt((req.query.userId as string) ?? "0", 10);
    if (!userId) {
      res.status(401).end();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // desabilita buffering em nginx
    res.flushHeaders();

    // Heartbeat a cada 25s para manter conexão viva através de proxies
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    addSSEClient(userId, res);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeSSEClient(res);
    });
  });

  // ─── Webhook Debug (captura payload bruto para diagnóstico) ──────────────
  app.post("/api/webhook/debug", (req, res) => {
    console.log("[Webhook DEBUG] Headers:", JSON.stringify(req.headers));
    console.log("[Webhook DEBUG] Body:", JSON.stringify(req.body, null, 2));
    res.json({ received: true, body: req.body });
  });

  // ─── Webhook WaboxApp ──────────────────────────────────────────────────────
  app.post("/api/webhook/waboxapp", async (req, res) => {
    try {
      const body = req.body as Record<string, string>;

      console.log("[Webhook] Received payload:", JSON.stringify(body, null, 2));

      const token = body.token;
      const event = body.event;
      const instanceUid = body.uid;

      if (!token || !instanceUid) {
        console.warn("[Webhook] Missing token or uid", { token: !!token, uid: instanceUid });
        res.status(400).json({ error: "Missing token or uid" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "DB unavailable" });
        return;
      }

      const configRows = await db
        .select({ userId: apiConfigs.userId })
        .from(apiConfigs)
        .where(eq(apiConfigs.token, token))
        .limit(1);

      if (!configRows[0]) {
        console.warn("[Webhook] Unknown token received for uid:", instanceUid);
        res.status(403).json({ error: "Unknown token" });
        return;
      }

      const userId = configRows[0].userId;

      let instance = await getInstanceByUid(userId, instanceUid);
      if (!instance) {
        const cleanUid = instanceUid.replace(/@c\.us$/, "").replace(/@g\.us$/, "");
        instance = await getInstanceByUid(userId, cleanUid);
      }
      if (!instance) {
        const allInstances = await getInstances(userId);
        console.warn("[Webhook] Instance not found:", instanceUid, "| Registered:", allInstances.map(i => i.uid));
        res.status(404).json({ error: "Instance not found", uid: instanceUid });
        return;
      }

      if (event === "message") {
        // express.urlencoded com extended:true converte bracket notation em objetos
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawBody = body as any;
        const contact = rawBody.contact ?? {};
        const message = rawBody.message ?? {};

        const contactUid = contact.uid ?? body["contact[uid]"] ?? "";
        const contactName = contact.name ?? body["contact[name]"] ?? "";
        const contactType: "user" | "group" = (contact.type ?? body["contact[type]"] ?? "user") as "user" | "group";
        const msgDir = (message.dir ?? body["message[dir]"] ?? "i") as "i" | "o";
        const msgType = message.type ?? body["message[type]"] ?? "chat";
        const msgUid = message.uid ?? body["message[uid]"] ?? null;
        const msgCuid = message.cuid ?? body["message[cuid]"] ?? null;
        const msgDtmRaw = message.dtm ?? body["message[dtm]"];
        const msgDtm = msgDtmRaw ? parseInt(String(msgDtmRaw), 10) : null;
        const msgAckRaw = message.ack ?? body["message[ack]"] ?? body["ack"] ?? 0;
        const msgAck = parseInt(String(msgAckRaw), 10);

        if (!contactUid) {
          console.warn("[Webhook] Missing contact uid in message event");
          res.status(400).json({ error: "Missing contact uid" });
          return;
        }

        let msgBody: Record<string, unknown> = {};
        if (message.body && typeof message.body === "object") {
          msgBody = { ...message.body };
        } else if (typeof message.body === "string") {
          msgBody = { text: message.body };
        } else {
          if (msgType === "chat") {
            msgBody.text = body["message[body][text]"] ?? body["message[body]"] ?? "";
          } else {
            for (const [key, val] of Object.entries(body)) {
              const match = key.match(/^message\[body\]\[(.+)\]$/);
              if (match) msgBody[match[1]] = val;
            }
          }
        }

        const { id: contactId } = await upsertContact(instance.id, contactUid, contactName, contactType);

        await insertMessage({
          instanceId: instance.id,
          contactId,
          muid: msgUid ?? null,
          cuid: msgCuid ?? null,
          direction: msgDir === "o" ? "out" : "in",
          type: (["chat", "image", "video", "audio", "ptt", "document", "vcard", "location"].includes(msgType)
            ? msgType
            : "unknown") as "chat" | "image" | "video" | "audio" | "ptt" | "document" | "vcard" | "location" | "unknown",
          body: msgBody,
          ack: msgAck,
          dtm: msgDtm,
        });

        // Engine de marcadores: verifica as 4 primeiras mensagens recebidas e
        // ACUMULA todos os labels cujas regras casarem.
        //
        // ⚠ NÃO usar `contactHasLabel` como early-return aqui: isso impede que
        // um contato receba múltiplos marcadores (ex.: "saudação" + "interesse
        // em preço" + "objeção sobre prazo"). applyLabelsToContact é idempotente
        // (onConflictDoNothing), então reprocessar é seguro.
        if (msgDir === "i") {
          const inboundCount = await getInboundMessageCount(contactId);
          if (inboundCount <= 4) {
            const firstMessages = await getFirstInboundMessages(contactId, 4);
            const messageTexts = firstMessages.map((msg) => {
              const body = msg.body as { text?: string } | null;
              return typeof body?.text === "string" ? body.text : "";
            });
            const labelIds = await matchAllLabelsForMessages(userId, messageTexts);
            if (labelIds.length > 0) {
              await applyLabelsToContact(contactId, labelIds);
              console.log("[Webhook] Labels applied:", labelIds, "to contact:", contactId);
            }
          }
        }

        broadcastToUser(userId, "new_message", {
          instanceId: instance.id,
          instanceUid,
          contactId,
          contactUid,
          contactName,
          direction: msgDir,
          type: msgType,
          body: msgBody,
          dtm: msgDtm,
        });

        console.log("[Webhook] Message saved successfully:", msgUid);
      } else if (event === "ack") {
        const muid = body.muid;
        const ack = body.ack ? parseInt(body.ack, 10) : 0;
        if (muid) {
          const { updateMessageAck } = await import("../db");
          await updateMessageAck(muid, ack);

          // ACK semântico — WhatsApp:
          //   0 = enviado pro servidor (clock)
          //   1 = entregue (✓)
          //   2 = recebido pelo destinatário (✓✓ cinza)
          //   3 = lido (✓✓ azul)
          // O event `message_read` é o gatilho para fluxos automáticos
          // (ex: registrar leitura, abrir cadência de follow-up, etc).
          broadcastToUser(userId, "message_ack", { instanceId: instance.id, muid, ack });
          if (ack === 2) {
            broadcastToUser(userId, "message_delivered", { instanceId: instance.id, muid });
          } else if (ack >= 3) {
            broadcastToUser(userId, "message_read", { instanceId: instance.id, muid });
          }
          console.log("[Webhook] ACK updated:", muid, "=>", ack, ack >= 3 ? "(LIDO)" : ack === 2 ? "(entregue)" : "");
        }
      } else {
        console.log("[Webhook] Unknown event:", event);
      }

      res.json({ success: true });
    } catch (err) {
      console.error("[Webhook] Error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // ─── tRPC API ──────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ─── Vite / Static ─────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // ─── Ordem de boot (CRÍTICO) ───────────────────────────────────────────────
  // O servidor SÓ pode aceitar requests depois que o schema existe. Antes, o
  // `server.listen()` era chamado primeiro e as migrações rodavam dentro do
  // callback — o servidor ficava "live" e respondia tRPC com erro silencioso
  // (responseBytes=29) enquanto o schema ainda não tinha sido aplicado.

  // 0) Espera o Postgres aceitar conexões (retry com backoff). Se o banco não
  //    subir a tempo, encerra o processo para o Render reiniciar e tentar de novo.
  try {
    await waitForDb();
  } catch (err) {
    console.error("[boot] banco indisponível — encerrando para reinício:", err);
    process.exit(1);
  }

  // 1+2) Migrações + seed de usuários — AGUARDADAS antes de servir requests.
  const migStart = Date.now();
  console.log("[boot] aplicando migrations/seed…");
  try {
    await ensureAuthSchema();
    console.log(`[boot] migrations/seed concluídas em ${Date.now() - migStart}ms`);
  } catch (err) {
    console.error(`[boot] ensureAuthSchema falhou após ${Date.now() - migStart}ms (servidor continuará rodando):`, err);
  }

  // 3) ETL Google Sheets → Postgres em background (sem await — não bloqueia).
  try {
    const { startSheetsSync } = await import("../sheetsSync");
    startSheetsSync();
  } catch (err) {
    console.error("[boot] startSheetsSync falhou:", err);
  }

  // 4) Poller de status das instâncias em background.
  startPoller();

  // 5) Só agora o servidor passa a aceitar requests.
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Keep-alive depende do servidor já estar no ar (self-ping).
    if (process.env.KEEP_ALIVE_ENABLED !== "false") {
      startKeepAlive(port);
    }
  });
}

startServer().catch(console.error);
