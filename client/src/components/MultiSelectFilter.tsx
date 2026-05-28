/**
 * Filtro multi-seleção compacto pra usar no header do dashboard,
 * ao lado do DateRangePicker.
 */
import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface MultiSelectFilterProps {
  label: string;          // "Hospital", "Procedimento" — exibido quando vazio
  options: string[];      // valores disponíveis
  selected: string[];     // valores escolhidos
  onChange: (next: string[]) => void;
  icon?: React.ReactNode;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  icon,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const isActive = selected.length > 0;
  const displayText =
    selected.length === 0
      ? label
      : selected.length === 1
      ? selected[0]
      : `${label}: ${selected.length}`;

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              isActive
                ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900"
            }`}
          >
            {icon}
            <span className="max-w-[140px] truncate">{displayText}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-0 shadow-xl border border-gray-100 rounded-2xl overflow-hidden"
          align="end"
          sideOffset={8}
        >
          <div className="px-3 pt-3 pb-2 border-b border-gray-50">
            <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">{label}</p>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">Nenhuma opção</p>
            ) : (
              options.map((opt) => {
                const checked = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggle(opt)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        checked
                          ? "bg-gray-900 border-gray-900"
                          : "bg-white border-gray-300"
                      }`}
                    >
                      {checked && <Check className="h-2.5 w-2.5 text-white" />}
                    </span>
                    <span className={checked ? "text-gray-900 font-medium" : "text-gray-600"}>{opt}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-gray-50 px-3 py-2">
              <button
                onClick={() => onChange([])}
                className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {isActive && (
        <button
          onClick={() => onChange([])}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          title={`Limpar ${label.toLowerCase()}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
