/**
 * usePermissions — hook único para checar role e permissões do usuário logado.
 *
 * Como funciona:
 *   1. `trpc.auth.me` retorna `{ id, username, name, role, permissions }`.
 *   2. `permissions` é um objeto `{ [chave]: boolean }` calculado no backend
 *      a partir do mapa central em `server/auth.ts > PERMISSIONS`.
 *   3. O hook expõe `role`, `is(role)`, `can(key)`, `user`.
 *
 * Para liberar uma nova feature por role:
 *   - Adicione a chave em `server/auth.ts > PERMISSIONS` (ex.: `manageUsers: ["admin"]`).
 *   - Use no frontend: `const { can } = usePermissions(); can("manageUsers") && <Button/>`.
 *   - Para checks no backend, use `adminProcedure` ou crie um middleware similar
 *     que valide o role.
 */
import { trpc } from "@/lib/trpc";

export type Role = "user" | "admin";

/** Mesmas chaves de `server/auth.ts > PERMISSIONS`. */
export type PermissionKey =
  | "manageInstances"
  | "manageLabels"
  | "manageConfig"
  | "viewCriativos"
  | "viewDashboard"
  | "viewContacts"
  | "viewOperacao";

export interface AuthMe {
  id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  permissions: Record<string, boolean>;
}

export function usePermissions() {
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  const role: Role | null = user?.role ?? null;

  /** Verifica se o user tem um role específico. */
  function is(target: Role | Role[]): boolean {
    if (!role) return false;
    return Array.isArray(target) ? target.includes(role) : role === target;
  }

  /** Verifica permissão por chave (lida do backend). Default `false` se desconhecida. */
  function can(key: PermissionKey | string): boolean {
    if (!user?.permissions) return false;
    return user.permissions[key] === true;
  }

  const isAdmin = role === "admin";

  return {
    user: (user as AuthMe | null | undefined) ?? null,
    role,
    isAdmin,
    is,
    can,
    isLoading,
  };
}
