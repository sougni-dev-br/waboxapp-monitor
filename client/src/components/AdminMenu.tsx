/**
 * AdminMenu — dropdown no header visível só pra admins.
 * Abre 2 modais: gerenciar usuários e regras de automação.
 */
import { useState, useRef, useEffect } from "react";
import { ShieldCheck, Users, Zap, ChevronDown } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { UsersManagerModal } from "./UsersManagerModal";
import { AutomationRulesModal } from "./AutomationRulesModal";

export function AdminMenu() {
  const { isAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!isAdmin) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
        title="Configurações de administração"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Admin</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-56 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Administração
            </p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setShowAutomation(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-[#DFFF00]/30 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-[#11131F]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-tight">Automação</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                Regras, triggers, mensagens
              </p>
            </div>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setShowUsers(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-blue-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-tight">Usuários</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                Adicionar e remover acessos
              </p>
            </div>
          </button>
        </div>
      )}

      <UsersManagerModal open={showUsers} onClose={() => setShowUsers(false)} />
      <AutomationRulesModal open={showAutomation} onClose={() => setShowAutomation(false)} />
    </div>
  );
}
