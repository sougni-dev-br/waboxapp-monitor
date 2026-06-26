import React, { createContext, useContext, useState, useMemo, useCallback } from "react";

export type DateRangePreset = "today" | "7d" | "30d" | "thisMonth" | "lastMonth" | "custom";

/** null = todos os hospitais */
export type HospitalFilter = null | "HOLHOS" | "HOPE" | "CBV" | "CRV" | "SANTA LUZIA";

export interface DateRangeValue {
  from: Date;
  to: Date;
  preset: DateRangePreset;
}

interface DateRangeContextType extends DateRangeValue {
  setRange: (value: Partial<DateRangeValue>) => void;
  setPreset: (preset: DateRangePreset) => void;
  /** ISO string YYYY-MM-DD (inclusive start) */
  fromISO: string;
  /** ISO string YYYY-MM-DD (inclusive end) */
  toISO: string;
  /** Numero de dias no range (inclusive) */
  days: number;
  /** Hospital atualmente filtrado (null = todos) */
  hospital: HospitalFilter;
  setHospital: (h: HospitalFilter) => void;
}

const DateRangeContext = createContext<DateRangeContextType | undefined>(undefined);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function rangeFromPreset(preset: DateRangePreset): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  if (preset === "today") {
    return { from: today, to: todayEnd };
  }
  if (preset === "7d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6); // hoje + 6 = 7 dias
    return { from, to: todayEnd };
  }
  if (preset === "30d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from, to: todayEnd };
  }
  if (preset === "thisMonth") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from, to: todayEnd };
  }
  if (preset === "lastMonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }
  // custom — usa últimos 30 dias como fallback
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from, to: todayEnd };
}

interface DateRangeProviderProps {
  children: React.ReactNode;
  defaultPreset?: DateRangePreset;
}

export function DateRangeProvider({ children, defaultPreset = "30d" }: DateRangeProviderProps) {
  const initial = useMemo(() => rangeFromPreset(defaultPreset), [defaultPreset]);
  const [state, setState] = useState<DateRangeValue>({
    from: initial.from,
    to: initial.to,
    preset: defaultPreset,
  });
  const [hospital, setHospital] = useState<HospitalFilter>(null);

  const setRange = useCallback((value: Partial<DateRangeValue>) => {
    setState((prev) => ({ ...prev, ...value }));
  }, []);

  const setPreset = useCallback((preset: DateRangePreset) => {
    const { from, to } = rangeFromPreset(preset);
    setState({ from, to, preset });
  }, []);

  const fromISO = toISO(state.from);
  const toISOStr = toISO(state.to);
  const days = Math.max(
    1,
    Math.round((endOfDay(state.to).getTime() - startOfDay(state.from).getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

  return (
    <DateRangeContext.Provider
      value={{
        ...state,
        setRange,
        setPreset,
        fromISO,
        toISO: toISOStr,
        days,
        hospital,
        setHospital,
      }}
    >
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) {
    throw new Error("useDateRange must be used within DateRangeProvider");
  }
  return ctx;
}
