/**
 * Lista canônica de unidades/hospitais (espelha server/hospitalUtils.ts).
 * Mantenha em sincronia com o backend ao adicionar/remover unidades.
 */
export const HOSPITALS = ["HOLHOS", "HOPE", "CBV", "CRV", "SANTA LUZIA"] as const;
export type Hospital = (typeof HOSPITALS)[number];
