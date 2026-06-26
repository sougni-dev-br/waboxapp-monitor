/**
 * hospitalUtils — fonte ÚNICA de verdade sobre unidades/hospitais.
 *
 * Antes existiam duas derivações divergentes de hospital a partir do alias da
 * instância (uma em `mediaInvestment.ts > mapInstanceToHospital`, outra inline
 * em `routers.ts > exportLeadsForPipeline`). Este módulo unifica ambas.
 *
 * Regra: o hospital pode ser uma coluna explícita em `instances.hospital`;
 * quando ausente, deriva-se do alias via `hospitalOf()` (fallback HOLHOS).
 */

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

/** Hospital efetivo de uma instância: coluna explícita ou fallback do alias. */
export function instanceHospital(inst: { hospital?: string | null; alias?: string | null }): Hospital {
  if (inst.hospital && (HOSPITALS as readonly string[]).includes(inst.hospital)) {
    return inst.hospital as Hospital;
  }
  return hospitalOf(inst.alias);
}
