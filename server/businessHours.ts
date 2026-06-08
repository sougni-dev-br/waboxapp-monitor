/**
 * server/businessHours.ts — utilitário de horário comercial.
 *
 * Política da operação: SEG-SEX, 08h-17h horário de Brasília (America/Sao_Paulo, UTC-3).
 * Todos os cálculos de tempo (TME, TMA, SLA, fila) usam esta função pra excluir
 * fins de semana e madrugadas — assim um lead que chega sexta às 16h e é respondido
 * segunda às 09h conta como 2h, não 65h.
 *
 * Não usamos lib externa (date-fns-tz, luxon) pra manter o bundle leve. Em vez
 * disso convertemos via offset fixo UTC-3, que é o que o Brasil usa hoje
 * (horário de verão foi extinto).
 */

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3 (Brasília sem horário de verão)
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 17;
const BUSINESS_MINUTES_PER_DAY = (BUSINESS_END_HOUR - BUSINESS_START_HOUR) * 60; // 540 min

/**
 * Retorna uma Date "deslocada" pra parecer estar em BRT quando lemos os
 * componentes via getUTC* (a Date guarda em UTC internamente, então pra
 * trabalhar com calendário/horas locais BRT sem libs externas, somamos o
 * offset).
 */
function toBrt(d: Date): Date {
  return new Date(d.getTime() + BRT_OFFSET_MS);
}

/** True quando a data BRT é segunda a sexta. */
function isBusinessDay(brt: Date): boolean {
  const dow = brt.getUTCDay(); // 0=dom .. 6=sab
  return dow >= 1 && dow <= 5;
}

/**
 * Conta minutos comerciais entre dois timestamps (segunda-sexta, 08-17h BRT).
 * Retorna 0 se end <= start ou se ambos caem fora do horário no mesmo dia.
 *
 * Estratégia: caminha dia a dia em BRT, soma a interseção do intervalo com
 * a janela 08-17h daquele dia útil.
 */
export function businessMinutesBetween(start: Date | string | number, end: Date | string | number): number {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  if (e.getTime() <= s.getTime()) return 0;

  let total = 0;
  // Trabalhamos no calendário BRT — usar UTC nos componentes da Date
  // deslocada equivale a "ler na timezone BRT".
  const sBrt = toBrt(s);
  const eBrt = toBrt(e);

  // Itera dia a dia (calendário BRT) entre start e end.
  const dayCursor = new Date(Date.UTC(
    sBrt.getUTCFullYear(),
    sBrt.getUTCMonth(),
    sBrt.getUTCDate(),
    0, 0, 0, 0,
  ));
  const lastDay = new Date(Date.UTC(
    eBrt.getUTCFullYear(),
    eBrt.getUTCMonth(),
    eBrt.getUTCDate(),
    0, 0, 0, 0,
  ));

  while (dayCursor.getTime() <= lastDay.getTime()) {
    if (isBusinessDay(dayCursor)) {
      // Janela comercial do dia em "BRT-time" (Date com UTC=BRT pra simplificar)
      const dayStartBrt = new Date(dayCursor.getTime() + BUSINESS_START_HOUR * 60 * 60 * 1000);
      const dayEndBrt = new Date(dayCursor.getTime() + BUSINESS_END_HOUR * 60 * 60 * 1000);

      // Intersecta com [sBrt, eBrt]
      const winStart = Math.max(dayStartBrt.getTime(), sBrt.getTime());
      const winEnd = Math.min(dayEndBrt.getTime(), eBrt.getTime());

      if (winEnd > winStart) {
        total += Math.round((winEnd - winStart) / 60000);
      }
    }
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
  }

  return total;
}

/**
 * Equivalente em horas (com decimais). Útil pra exibição (ex.: "2.5 h").
 */
export function businessHoursBetween(start: Date | string | number, end: Date | string | number): number {
  return businessMinutesBetween(start, end) / 60;
}

/**
 * Limite máximo de minutos comerciais em um dia (usado pra normalizar).
 */
export const BUSINESS_MINUTES_PER_BUSINESS_DAY = BUSINESS_MINUTES_PER_DAY;

/**
 * Retorna `now` ajustada para o último instante comercial passado — se o
 * agora cai fora do expediente, "congela" no final do último horário útil.
 * Útil pra calcular tempo de espera de leads em queue (sem inflar com noite/finde).
 */
export function clampToBusinessNow(now: Date = new Date()): Date {
  const brt = toBrt(now);
  const day = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 0, 0, 0, 0));
  const startToday = day.getTime() + BUSINESS_START_HOUR * 60 * 60 * 1000;
  const endToday = day.getTime() + BUSINESS_END_HOUR * 60 * 60 * 1000;
  const tBrt = brt.getTime();

  if (isBusinessDay(day)) {
    if (tBrt < startToday) {
      // Antes de abrir hoje — volta pro fim do dia útil anterior
      const cursor = new Date(day);
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      while (!isBusinessDay(cursor)) cursor.setUTCDate(cursor.getUTCDate() - 1);
      return new Date(cursor.getTime() + BUSINESS_END_HOUR * 60 * 60 * 1000 - BRT_OFFSET_MS);
    }
    if (tBrt > endToday) {
      return new Date(endToday - BRT_OFFSET_MS);
    }
    return now;
  }

  // Fim de semana — volta pro fim do último dia útil
  const cursor = new Date(day);
  while (!isBusinessDay(cursor)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  return new Date(cursor.getTime() + BUSINESS_END_HOUR * 60 * 60 * 1000 - BRT_OFFSET_MS);
}
