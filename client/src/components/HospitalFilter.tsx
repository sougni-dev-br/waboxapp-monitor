/**
 * Filtro de hospital — botões toggle pra restringir TODAS as métricas do
 * dashboard a um hospital específico (HOPE, CBV, HOLHOS) ou "Todos".
 *
 * O estado mora no DateRangeContext (compartilhado com o filtro de data).
 */
import { useDateRange, type HospitalFilter } from "@/contexts/DateRangeContext";
import { usePermissions } from "@/hooks/usePermissions";
import { HOSPITALS } from "@/lib/hospitals";

export function HospitalFilterButtons({ className = "" }: { className?: string }) {
  const { hospital, setHospital } = useDateRange();
  const { allowedHospitals } = usePermissions();

  // null = sem restrição → todas as unidades; senão só as permitidas.
  const visible = allowedHospitals ?? [...HOSPITALS];
  const options: Array<{ id: HospitalFilter; label: string }> = [
    { id: null, label: "Todos" },
    ...visible.map((h) => ({ id: h as HospitalFilter, label: h })),
  ];

  // Usuário com 1 só unidade não precisa de filtro.
  if (visible.length <= 1) return null;

  return (
    <div className={`flex items-center gap-1 p-1 rounded-lg bg-muted/40 border border-border ${className}`}>
      {options.map((opt) => {
        const active = hospital === opt.id;
        return (
          <button
            key={opt.label}
            onClick={() => setHospital(opt.id)}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
              active
                ? "bg-[#11131F] text-white shadow-sm"
                : "text-gray-500 hover:text-[#11131F] hover:bg-white/60"
            }`}
            title={opt.id ? `Ver só ${opt.id}` : "Ver todos os hospitais"}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
