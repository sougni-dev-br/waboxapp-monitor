/**
 * FilterBar — barra de filtros reutilizável para listas de contatos.
 *
 * Aceita:
 *  - dateFrom / dateTo  → strings no formato DD/MM/AAAA (exibição) e YYYY-MM-DD (valor interno)
 *  - labelId            → ID do marcador selecionado (ou null = todos)
 *
 * Converte automaticamente entre DD/MM/AAAA (input do usuário) e YYYY-MM-DD (valor para a query).
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { CalendarRange, Tag, X, Filter, ChevronDown } from "lucide-react";
import { format, parse, isValid, subDays } from "date-fns";

interface FilterBarProps {
  /** Valor atual da data inicial em YYYY-MM-DD (ou undefined) */
  dateFrom?: string;
  /** Valor atual da data final em YYYY-MM-DD (ou undefined) */
  dateTo?: string;
  /** ID do marcador selecionado (null = todos) */
  labelId?: number | null;
  /** Callback chamado quando qualquer filtro muda */
  onChange: (filters: { dateFrom?: string; dateTo?: string; labelId?: number | null }) => void;
  /** Contagem de contatos após filtro */
  count?: number;
  /** Contagem total sem filtro */
  total?: number;
}

/** Converte DD/MM/AAAA → YYYY-MM-DD (retorna undefined se inválido) */
function parseBR(value: string): string | undefined {
  if (!value || value.length < 10) return undefined;
  const d = parse(value, "dd/MM/yyyy", new Date());
  if (!isValid(d)) return undefined;
  return format(d, "yyyy-MM-dd");
}

/** Converte YYYY-MM-DD → DD/MM/AAAA */
function toBR(value: string | undefined): string {
  if (!value) return "";
  try {
    const d = parse(value, "yyyy-MM-dd", new Date());
    if (!isValid(d)) return "";
    return format(d, "dd/MM/yyyy");
  } catch {
    return "";
  }
}

/** Formata input enquanto o usuário digita: insere barras automaticamente */
function maskDate(raw: string): string {
  // Remove tudo que não é dígito
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function FilterBar({ dateFrom, dateTo, labelId, onChange, count, total }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const [fromInput, setFromInput] = useState(toBR(dateFrom));
  const [toInput, setToInput] = useState(toBR(dateTo));
  const [labelOpen, setLabelOpen] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  const { data: labels = [] } = trpc.labels.list.useQuery(undefined, { refetchInterval: 60_000 });

  const hasActiveFilter = !!(dateFrom || dateTo || labelId != null);
  const selectedLabel = labels.find((l) => l.id === labelId);

  // Placeholders dinâmicos: 1º de janeiro / hoje do ano corrente
  const placeholders = useMemo(() => {
    const now = new Date();
    return {
      from: `01/01/${now.getFullYear()}`,
      to: format(now, "dd/MM/yyyy"),
    };
  }, []);

  function applyPreset(days: number) {
    const today = new Date();
    const from = subDays(today, days);
    onChange({
      dateFrom: format(from, "yyyy-MM-dd"),
      dateTo: format(today, "yyyy-MM-dd"),
      labelId,
    });
  }

  // Sincroniza inputs quando props mudam externamente
  useEffect(() => { setFromInput(toBR(dateFrom)); }, [dateFrom]);
  useEffect(() => { setToInput(toBR(dateTo)); }, [dateTo]);

  // Fecha dropdown de marcadores ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (labelRef.current && !labelRef.current.contains(e.target as Node)) {
        setLabelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleFromChange(raw: string) {
    const masked = maskDate(raw);
    setFromInput(masked);
    if (masked.length === 10) {
      const iso = parseBR(masked);
      onChange({ dateFrom: iso, dateTo, labelId });
    } else if (masked.length === 0) {
      onChange({ dateFrom: undefined, dateTo, labelId });
    }
  }

  function handleToChange(raw: string) {
    const masked = maskDate(raw);
    setToInput(masked);
    if (masked.length === 10) {
      const iso = parseBR(masked);
      onChange({ dateFrom, dateTo: iso, labelId });
    } else if (masked.length === 0) {
      onChange({ dateFrom, dateTo: undefined, labelId });
    }
  }

  function handleClear() {
    setFromInput("");
    setToInput("");
    onChange({ dateFrom: undefined, dateTo: undefined, labelId: undefined });
  }

  function handleLabelSelect(id: number | null) {
    onChange({ dateFrom, dateTo, labelId: id });
    setLabelOpen(false);
  }

  return (
    <div className="space-y-2">
      {/* Linha de controles */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Botão de filtro de data */}
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
            open || dateFrom || dateTo
              ? "bg-gray-900 text-white border-gray-900"
              : "text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          <CalendarRange className="w-3.5 h-3.5" />
          {dateFrom || dateTo
            ? `${toBR(dateFrom) || "início"} → ${toBR(dateTo) || "hoje"}`
            : "Filtrar por data"}
        </button>

        {/* Seletor de marcador */}
        <div className="relative" ref={labelRef}>
          <button
            onClick={() => setLabelOpen(!labelOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
              labelId != null
                ? "bg-gray-900 text-white border-gray-900"
                : "text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {selectedLabel ? (
              <>
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedLabel.color ?? "#888" }}
                />
                {selectedLabel.name}
              </>
            ) : (
              <>
                <Tag className="w-3.5 h-3.5" />
                Marcador
              </>
            )}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {labelOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]">
              <button
                onClick={() => handleLabelSelect(null)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                  labelId == null ? "font-semibold text-gray-900" : "text-gray-600"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                Todos os marcadores
              </button>
              {labels.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400 italic">Nenhum marcador criado</p>
              )}
              {labels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => handleLabelSelect(label.id)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                    labelId === label.id ? "font-semibold text-gray-900" : "text-gray-600"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: label.color ?? "#888" }}
                  />
                  {label.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Limpar todos os filtros */}
        {hasActiveFilter && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors"
          >
            <X className="w-3 h-3" />
            Limpar
          </button>
        )}

        {/* Contagem */}
        {total !== undefined && (
          <span className="ml-auto text-xs text-gray-400">
            {hasActiveFilter
              ? `${count ?? 0} de ${total} contatos`
              : `${total} contatos`}
          </span>
        )}
      </div>

      {/* Painel de datas (expansível) */}
      {open && (
        <div className="bg-gray-50 rounded-xl p-3.5 space-y-3 border border-gray-100">
          <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5 text-gray-400" />
            Data de entrada da primeira mensagem
          </p>
          {/* Atalhos rápidos */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-gray-400 mr-1">Rápido:</span>
            {[
              { label: "Hoje", days: 0 },
              { label: "7d", days: 7 },
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
            ].map(({ label, days }) => (
              <button
                key={label}
                onClick={() => applyPreset(days)}
                className="px-2 py-0.5 text-[11px] font-medium bg-white text-gray-600 border border-gray-200 rounded hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">De (DD/MM/AAAA)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder={placeholders.from}
                value={fromInput}
                onChange={(e) => handleFromChange(e.target.value)}
                maxLength={10}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Até (DD/MM/AAAA)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder={placeholders.to}
                value={toInput}
                onChange={(e) => handleToChange(e.target.value)}
                maxLength={10}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 transition-colors font-mono"
              />
            </div>
          </div>
          {hasActiveFilter && (dateFrom || dateTo) && (
            <p className="text-xs text-indigo-600">
              <Filter className="w-3 h-3 inline mr-1" />
              Mostrando contatos com primeira mensagem
              {dateFrom && ` a partir de ${toBR(dateFrom)}`}
              {dateFrom && dateTo && " até "}
              {dateTo && !dateFrom && "até "}
              {dateTo && toBR(dateTo)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
