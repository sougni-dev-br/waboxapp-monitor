import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import * as jose from "jose";
import { ENV } from "./env";

// Contexto simplificado: sem User do DB, apenas flag de autenticado
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: { id: number; openId: string; name: string | null; email: string | null; loginMethod: string | null; role: "user" | "admin"; createdAt: Date; updatedAt: Date; lastSignedIn: Date } | null;
  isAuthed: boolean;
};

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

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const cookie = opts.req.headers.cookie ?? "";
  const match = cookie.match(/panel_session=([^;]+)/);
  const token = match?.[1];

  if (!token) {
    return { req: opts.req, res: opts.res, user: null, isAuthed: false };
  }

  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret || "waboxapp-panel-secret");
    await jose.jwtVerify(token, secret);
    return { req: opts.req, res: opts.res, user: PANEL_USER, isAuthed: true };
  } catch {
    return { req: opts.req, res: opts.res, user: null, isAuthed: false };
  }
}
