/**
 * Fallback estático de unidades.
 *
 * A fonte de verdade passou a ser a tabela `units` no banco, lida via
 * `trpc.units.list` / `trpc.units.listActive`. Esta lista é usada apenas como
 * fallback (primeira carga, query ainda pendente, ou banco sem unidades) para
 * não quebrar a UI. Mantenha em sincronia com o seed em server/_core/migrate.ts.
 */
export const HOSPITALS = ["HOLHOS", "HOPE", "CBV", "CRV", "SANTA LUZIA"] as const;
export type Hospital = (typeof HOSPITALS)[number];

/** Forma mínima de uma unidade vinda do backend. */
export interface UnitOption {
  id: number;
  name: string;
  label: string;
  active: boolean;
}

/** Unidades de fallback no formato de opção (quando o banco ainda não respondeu). */
export const FALLBACK_UNIT_OPTIONS: UnitOption[] = HOSPITALS.map((name, i) => ({
  id: -1 - i,
  name,
  label: name,
  active: true,
}));
