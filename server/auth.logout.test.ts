import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

describe("auth.logout", () => {
  it("limpa o cookie panel_session e retorna sucesso", async () => {
    const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];

    const ctx: TrpcContext = {
      user: PANEL_USER,
      isAuthed: true,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
        cookie: vi.fn(),
      } as unknown as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe("panel_session");
    expect(clearedCookies[0]?.options).toMatchObject({ path: "/" });
  });
});
