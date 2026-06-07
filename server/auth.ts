/**
 * server/auth.ts — Multi-user login com bcrypt + RBAC.
 *
 * Por enquanto o painel é single-workspace (todos os usuários acessam os mesmos
 * dados em OWNER_ID = 1). O que muda por usuário é o `role` — `admin` libera
 * tudo, `user` é leitura ou subset limitado. Quando criarmos perfis adicionais
 * (operador, sdr, financeiro), basta estender o enum `role` no schema e
 * espalhar os checks via `hasPermission` ou middleware `adminProcedure`.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, type User } from "../drizzle/schema";

export type Role = "user" | "admin";

export interface AuthUser {
  id: number;
  openId: string;
  username: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  active: boolean;
}

function toAuth(u: User): AuthUser {
  return {
    id: u.id,
    openId: u.openId,
    username: u.username ?? null,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
  };
}

export async function findUserById(id: number): Promise<AuthUser | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return toAuth(row);
}

export async function findUserByUsername(username: string): Promise<(AuthUser & { passwordHash: string | null }) | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...toAuth(row), passwordHash: row.passwordHash ?? null };
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function touchLastSignedIn(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

// ─── Permissions ─────────────────────────────────────────────────────────────
//
// Os recursos abaixo são o ponto único de verdade. Cada nova feature
// adiciona uma chave e o frontend lê via `hasPermission(role, key)`.
// Quando criarmos roles intermediárias (sdr, financeiro, operador), basta
// listar quais chaves cada role libera.

export const PERMISSIONS = {
  // Configurações sensíveis
  manageInstances: ["admin"] as Role[],
  manageLabels: ["admin"] as Role[],
  manageConfig: ["admin"] as Role[],
  viewCriativos: ["admin"] as Role[],
  // Visualização (todos os roles ativos)
  viewDashboard: ["admin", "user"] as Role[],
  viewContacts: ["admin", "user"] as Role[],
  viewOperacao: ["admin", "user"] as Role[],
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function hasPermission(role: Role | null | undefined, key: PermissionKey): boolean {
  if (!role) return false;
  return PERMISSIONS[key].includes(role);
}
