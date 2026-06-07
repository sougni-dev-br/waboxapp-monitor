import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import * as jose from "jose";
import { ENV } from "./env";
import { findUserById, type AuthUser } from "../auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthUser | null;
  isAuthed: boolean;
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
    const { payload } = await jose.jwtVerify(token, secret);

    // O `sub` do JWT é o id do user (string). Tokens antigos podem ter
    // sub="panel-owner" — esses tratamos como o usuário rafael (id=1)
    // para manter compat sem forçar logout.
    let userId: number;
    if (typeof payload.sub === "string" && /^\d+$/.test(payload.sub)) {
      userId = parseInt(payload.sub, 10);
    } else if (payload.sub === "panel-owner") {
      userId = 1; // compat: antigos cookies sem id
    } else {
      return { req: opts.req, res: opts.res, user: null, isAuthed: false };
    }

    const user = await findUserById(userId);
    if (!user || !user.active) {
      return { req: opts.req, res: opts.res, user: null, isAuthed: false };
    }
    return { req: opts.req, res: opts.res, user, isAuthed: true };
  } catch {
    return { req: opts.req, res: opts.res, user: null, isAuthed: false };
  }
}
