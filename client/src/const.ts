// Constantes do frontend
export const SESSION_COOKIE_NAME = "panel_session";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

/**
 * Base URL do app, configurada via Vite (`base` em vite.config.ts).
 * Em produção: "/monitor/". Em dev: "/".
 * Sempre termina com "/".
 */
export const APP_BASE_URL = import.meta.env.BASE_URL || "/";

/** Constrói uma URL absoluta a partir da raiz do app. */
export function appUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  return APP_BASE_URL + clean;
}
