/**
 * hospitalUtils — fonte ÚNICA de verdade sobre unidades/hospitais.
 *
 * Antes existiam duas derivações divergentes de hospital a partir do alias da
 * instância (uma em `mediaInvestment.ts > mapInstanceToHospital`, outra inline
 * em `routers.ts > exportLeadsForPipeline`). Este módulo unifica ambas.
 *
 * Regra: o hospital pode ser uma coluna explícita em `instances.hospital`;
 * quando ausente, deriva-se do alias via `hospitalOf()` (fallback HOLHOS).
 *
 * A fonte de verdade das unidades agora é a tabela `units` no banco; `HOSPITALS`
 * permanece apenas como fallback estático (primeiro boot / DB indisponível).
 */
import { eq } from "drizzle-orm";
import { units } from "../drizzle/schema";

export const HOSPITALS = ["HOLHOS", "HOPE", "CBV", "CRV", "SANTA LUZIA"] as const;
export type Hospital = (typeof HOSPITALS)[number];

/**
 * Deriva o hospital a partir do alias do canal. Nunca retorna null — quando
 * não casa nenhum padrão, assume HOLHOS (comportamento histórico do export).
 */
export function hospitalOf(alias: string | null | undefined): Hospital {
  const a = (alias ?? "").toUpperCase();
  if (a.includes("HOPE")) return "HOPE";
  if (a.includes("CBV")) return "CBV";
  if (a.includes("CRV")) return "CRV";
  if (a.includes("SANTA LUZIA")) return "SANTA LUZIA";
  return "HOLHOS"; // fallback
}

/**
 * Hospital efetivo de uma instância: coluna explícita (qualquer unidade
 * cadastrada, inclusive as dinâmicas criadas pelo admin) ou fallback do alias.
 */
export function instanceHospital(inst: { hospital?: string | null; alias?: string | null }): string {
  const explicit = inst.hospital?.trim();
  if (explicit) return explicit;
  return hospitalOf(inst.alias);
}

/**
 * Nomes (slugs) das unidades ATIVAS no banco — fonte de verdade dinâmica.
 * Recebe a instância do drizzle por parâmetro para evitar import circular com
 * `db.ts`. Faz fallback para `HOSPITALS` quando o banco está vazio/indisponível.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getHospitalNames(db: any): Promise<string[]> {
  if (!db) return [...HOSPITALS];
  try {
    const rows = await db
      .select({ name: units.name })
      .from(units)
      .where(eq(units.active, true))
      .orderBy(units.name);
    const names = (rows as Array<{ name: string }>).map((r) => r.name);
    return names.length ? names : [...HOSPITALS];
  } catch {
    return [...HOSPITALS];
  }
}
