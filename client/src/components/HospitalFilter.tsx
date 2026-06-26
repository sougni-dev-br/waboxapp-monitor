/**
 * Filtro de hospital — botões toggle pra restringir TODAS as métricas do
 * dashboard a uma unidade específica ou "Todos".
 *
 * As unidades vêm da tabela `units` (via trpc.units.listActive). Cruzamos com
 * `allowedHospitals` do usuário: só aparecem unidades ativas E permitidas.
 * O estado mora no DateRangeContext (compartilhado com o filtro de data).
 */
import { useDateRange, type HospitalFilter } from "@/contexts/DateRangeContext";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export function HospitalFilterButtons({ className = "" }: { className?: string }) {
  const { hospital, setHospital } = useDateRange();
  const { allowedHospitals } = usePermissions();
  const { data: units } = trpc.units.listActive.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Fonte ÚNICA: unidades ativas vindas do banco. NÃO usamos o fallback estático
  // aqui — ele incluiria unidades inativas (ex.: CRV). Enquanto a query não
  // retorna, `visible` fica vazio e o filtro não renderiza. Filtro `active`
  // defensivo caso a query um dia traga inativas.
  const activeUnits = (units ?? []).filter((u) => u.active);

  // Cruza com as permissões do usuário (null = sem restrição → todas).
  const visible = allowedHospitals
    ? activeUnits.filter((u) => allowedHospitals.includes(u.name))
    : activeUnits;

  const options: Array<{ id: HospitalFilter; label: string }> = [
    { id: null, label: "Todos" },
    ...visible.map((u) => ({ id: u.name as HospitalFilter, label: u.label })),
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
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap transition-all ${
              active
                ? "bg-[#11131F] text-white shadow-sm"
                : "text-gray-500 hover:text-[#11131F] hover:bg-white/60"
            }`}
            title={opt.id ? `Ver só ${opt.label}` : "Ver todas as unidades"}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
