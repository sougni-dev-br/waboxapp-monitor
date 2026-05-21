import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getApiConfig: vi.fn(),
  getInstances: vi.fn(),
  getInstanceByUid: vi.fn(),
  createInstance: vi.fn(),
  deleteInstance: vi.fn(),
  updateInstanceStatus: vi.fn(),
  insertStatusLog: vi.fn(),
  getContacts: vi.fn(),
  getAllContacts: vi.fn(),
  getMessages: vi.fn(),
  upsertApiConfig: vi.fn(),
  upsertContact: vi.fn(),
  insertMessage: vi.fn(),
  getStatusLogs: vi.fn(),
  getDailyContactStats: vi.fn(),
  getLabels: vi.fn(),
  createLabel: vi.fn(),
  deleteLabel: vi.fn(),
  getLabelRules: vi.fn(),
  createLabelRule: vi.fn(),
  deleteLabelRule: vi.fn(),
}));

vi.mock("./waboxapp", () => ({
  checkInstanceStatus: vi.fn(),
  sendTextMessage: vi.fn(),
}));

vi.mock("nanoid", () => ({ nanoid: vi.fn(() => "test-nanoid-12") }));

import {
  getApiConfig,
  getInstances,
  getInstanceByUid,
  createInstance,
  upsertApiConfig,
  insertStatusLog,
  insertMessage,
} from "./db";
import { checkInstanceStatus, sendTextMessage } from "./waboxapp";

// ─── Context helpers ──────────────────────────────────────────────────────────

const PANEL_USER = {
  id: 1,
  openId: "panel-owner",
  name: "Rafael",
  email: null,
  loginMethod: "password",
  role: "admin" as const,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

function makeAuthedCtx(): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    user: PANEL_USER,
    isAuthed: true,
  };
}

function makePublicCtx(): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    user: null,
    isAuthed: false,
  };
}

// ─── auth ─────────────────────────────────────────────────────────────────────

describe("auth router", () => {
  it("auth.me retorna null quando não autenticado", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.me retorna usuário quando autenticado", async () => {
    const caller = appRouter.createCaller(makeAuthedCtx());
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.role).toBe("admin");
  });

  it("auth.login rejeita senha errada", async () => {
    process.env.PANEL_PASSWORD = "senha-correta";
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.auth.login({ password: "senha-errada" })).rejects.toThrow("Senha incorreta");
  });

  it("auth.login aceita senha correta e define cookie", async () => {
    process.env.PANEL_PASSWORD = "senha-correta";
    const ctx = makePublicCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({ password: "senha-correta" });
    expect(result.success).toBe(true);
    expect(ctx.res.cookie).toHaveBeenCalledWith(
      "panel_session",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/" })
    );
  });

  it("auth.logout limpa o cookie panel_session", async () => {
    const ctx = makePublicCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(ctx.res.clearCookie).toHaveBeenCalledWith("panel_session", { path: "/" });
  });
});

// ─── config ──────────────────────────────────────────────────────────────────

describe("config router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna hasToken=false quando não há configuração", async () => {
    vi.mocked(getApiConfig).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeAuthedCtx());
    const result = await caller.config.get();
    expect(result.hasToken).toBe(false);
    expect(result.token).toBeNull();
  });

  it("retorna hasToken=true quando há token configurado", async () => {
    vi.mocked(getApiConfig).mockResolvedValue({
      id: 1, userId: 1, token: "test-token-123", createdAt: new Date(), updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeAuthedCtx());
    const result = await caller.config.get();
    expect(result.hasToken).toBe(true);
    expect(result.token).toBe("test-token-123");
  });

  it("salva o token corretamente", async () => {
    vi.mocked(upsertApiConfig).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeAuthedCtx());
    const result = await caller.config.save({ token: "novo-token-456" });
    expect(result.success).toBe(true);
    expect(upsertApiConfig).toHaveBeenCalledWith(1, "novo-token-456");
  });

  it("config.get é protegido — lança UNAUTHORIZED quando não autenticado", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.config.get()).rejects.toThrow();
  });
});

// ─── instances ───────────────────────────────────────────────────────────────

describe("instances router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista instâncias do painel", async () => {
    vi.mocked(getInstances).mockResolvedValue([{
      id: 1, userId: 1, uid: "5511999999999", alias: "Suporte",
      status: "online" as const, platform: "android", battery: 85,
      plugged: false, locale: "pt_BR", hookUrl: null,
      lastCheckedAt: new Date(), lastOnlineAt: new Date(),
      createdAt: new Date(), updatedAt: new Date(),
    }]);
    const caller = appRouter.createCaller(makeAuthedCtx());
    const result = await caller.instances.list();
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("5511999999999");
  });

  it("lança erro ao adicionar instância sem token configurado", async () => {
    vi.mocked(getApiConfig).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeAuthedCtx());
    await expect(caller.instances.add({ uid: "5511999999999" })).rejects.toThrow("Configure a chave");
  });

  it("lança erro ao adicionar instância duplicada", async () => {
    vi.mocked(getApiConfig).mockResolvedValue({ id: 1, userId: 1, token: "valid-token", createdAt: new Date(), updatedAt: new Date() });
    vi.mocked(getInstanceByUid).mockResolvedValue({
      id: 1, userId: 1, uid: "5511999999999", alias: "Existente",
      status: "online" as const, platform: null, battery: null,
      plugged: null, locale: null, hookUrl: null,
      lastCheckedAt: null, lastOnlineAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeAuthedCtx());
    await expect(caller.instances.add({ uid: "5511999999999" })).rejects.toThrow("já está cadastrada");
  });

  it("adiciona instância com status online quando API retorna sucesso", async () => {
    vi.mocked(getApiConfig).mockResolvedValue({ id: 1, userId: 1, token: "valid-token", createdAt: new Date(), updatedAt: new Date() });
    vi.mocked(getInstanceByUid).mockResolvedValue(undefined);
    vi.mocked(checkInstanceStatus).mockResolvedValue({ success: true, uid: "5511999999999", alias: "Suporte", platform: "android", battery: "85", plugged: "0", locale: "pt_BR" });
    vi.mocked(createInstance).mockResolvedValue(42);
    vi.mocked(insertStatusLog).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeAuthedCtx());
    const result = await caller.instances.add({ uid: "5511999999999", alias: "Suporte" });
    expect(result.id).toBe(42);
    expect(result.status).toBe("online");
  });
});

// ─── messages.send ───────────────────────────────────────────────────────────

describe("messages.send router", () => {
  beforeEach(() => vi.clearAllMocks());

  const mockOnlineInstance = {
    id: 1, userId: 1, uid: "5511999999999", alias: "Suporte",
    status: "online" as const, platform: "android", battery: 85,
    plugged: false, locale: "pt_BR", hookUrl: null,
    lastCheckedAt: new Date(), lastOnlineAt: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
  };

  it("envia mensagem com sucesso quando instância está online", async () => {
    vi.mocked(getApiConfig).mockResolvedValue({ id: 1, userId: 1, token: "valid-token", createdAt: new Date(), updatedAt: new Date() });
    vi.mocked(getInstances).mockResolvedValue([mockOnlineInstance]);
    vi.mocked(sendTextMessage).mockResolvedValue({ success: true, custom_uid: "panel-test-nanoid-12" });
    vi.mocked(insertMessage).mockResolvedValue(99);
    const caller = appRouter.createCaller(makeAuthedCtx());
    const result = await caller.messages.send({ instanceId: 1, contactId: 5, contactUid: "5511888888888", text: "Olá!" });
    expect(result.success).toBe(true);
    expect(result.messageId).toBe(99);
  });

  it("lança erro ao enviar sem token configurado", async () => {
    vi.mocked(getApiConfig).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeAuthedCtx());
    await expect(caller.messages.send({ instanceId: 1, contactId: 5, contactUid: "5511888888888", text: "Oi" })).rejects.toThrow("Configure a chave");
  });

  it("lança erro ao enviar para instância offline", async () => {
    vi.mocked(getApiConfig).mockResolvedValue({ id: 1, userId: 1, token: "valid-token", createdAt: new Date(), updatedAt: new Date() });
    vi.mocked(getInstances).mockResolvedValue([{ ...mockOnlineInstance, status: "offline" as const }]);
    const caller = appRouter.createCaller(makeAuthedCtx());
    await expect(caller.messages.send({ instanceId: 1, contactId: 5, contactUid: "5511888888888", text: "Oi" })).rejects.toThrow("offline");
  });

  it("lança erro quando WaboxApp API retorna falha", async () => {
    vi.mocked(getApiConfig).mockResolvedValue({ id: 1, userId: 1, token: "valid-token", createdAt: new Date(), updatedAt: new Date() });
    vi.mocked(getInstances).mockResolvedValue([mockOnlineInstance]);
    vi.mocked(sendTextMessage).mockResolvedValue({ success: false, error: "Rate limit exceeded" });
    const caller = appRouter.createCaller(makeAuthedCtx());
    await expect(caller.messages.send({ instanceId: 1, contactId: 5, contactUid: "5511888888888", text: "Oi" })).rejects.toThrow("Rate limit exceeded");
  });
});
