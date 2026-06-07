import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { useDateRange, rangeFromPreset, type DateRangePreset } from "@/contexts/DateRangeContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "thisMonth", label: "Este mês" },
  { id: "lastMonth", label: "Mês passado" },
  { id: "custom", label: "Personalizado" },
];

function fmt(d: Date) {
  return format(d, "dd MMM yy", { locale: ptBR });
}

function toInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromInputValue(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function DateRangePicker({ className = "" }: { className?: string }) {
  const { from, to, preset, setPreset, setRange } = useDateRange();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => toInputValue(from));
  const [customTo, setCustomTo] = useState(() => toInputValue(to));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomFrom(toInputValue(from));
    setCustomTo(toInputValue(to));
  }, [from, to]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function pickPreset(id: DateRangePreset) {
    if (id === "custom") {
      setRange({ preset: "custom" });
      return;
    }
    setPreset(id);
    setOpen(false);
  }

  function applyCustom() {
    const fromD = fromInputValue(customFrom);
    const toD = fromInputValue(customTo);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) return;
    if (fromD.getTime() > toD.getTime()) return;
    fromD.setHours(0, 0, 0, 0);
    toD.setHours(23, 59, 59, 999);
    setRange({ from: fromD, to: toD, preset: "custom" });
    setOpen(false);
  }

  const presetLabel = PRESETS.find((p) => p.id === preset)?.label ?? "Período";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted transition-colors text-foreground"
        title="Selecionar período"
      >
        <Calendar className="w-3.5 h-3.5" />
        <span className="tabular">
          {fmt(from)} — {fmt(to)}
        </span>
        <span className="hidden md:inline text-muted-foreground border-l border-border pl-2 ml-1">
          {presetLabel}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-border bg-muted/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
              Atalhos
            </p>
            <div className="grid grid-cols-2 gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickPreset(p.id)}
                  className={`text-xs text-left px-2 py-1.5 rounded-md transition-colors ${
                    preset === p.id
                      ? "bg-foreground text-background font-semibold"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Personalizado
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">De</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Até</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground"
                />
              </div>
            </div>
            <button
              onClick={applyCustom}
              className="w-full mt-1 btn-primary text-xs py-1.5 rounded-md"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// helper export for callers that need the same range outside the picker
export { rangeFromPreset };
