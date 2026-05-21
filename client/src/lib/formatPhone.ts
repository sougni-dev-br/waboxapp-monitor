/**
 * Formata um UID WhatsApp para exibição amigável.
 * Suporta: BR (55) e fallback genérico para outros DDIs.
 * - 5511999998888  → "+55 11 99999-8888"
 * - 5561997344855  → "+55 61 9 9734-4855"
 * - 12025550100    → "+1 202 555 0100" (genérico)
 * - 5511...@c.us   → idem (suporta sufixos)
 * - Qualquer outro → retorna o uid limpo (sem sufixo)
 */
export function formatPhoneUid(uid: string): string {
  if (!uid) return "";
  // Remove sufixos do WaboxApp/WhatsApp
  const raw = uid.replace(/@c\.us$/, "").replace(/@g\.us$/, "").replace(/\D/g, "");

  // Brasil — 13 dígitos (55 + DDD 2 + 9 dígitos celular novo)
  if (raw.startsWith("55") && raw.length === 13) {
    const ddd = raw.slice(2, 4);
    const part1 = raw.slice(4, 9);
    const part2 = raw.slice(9);
    return `+55 ${ddd} ${part1}-${part2}`;
  }
  // Brasil — 12 dígitos (55 + DDD 2 + 8 dígitos fixo)
  if (raw.startsWith("55") && raw.length === 12) {
    const ddd = raw.slice(2, 4);
    const part1 = raw.slice(4, 8);
    const part2 = raw.slice(8);
    return `+55 ${ddd} ${part1}-${part2}`;
  }
  // EUA/Canadá — 11 dígitos começando com 1
  if (raw.startsWith("1") && raw.length === 11) {
    return `+1 ${raw.slice(1, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`;
  }
  // Fallback: retorna com + na frente se 10+ dígitos
  if (raw.length >= 10) return `+${raw}`;
  return raw || uid;
}
