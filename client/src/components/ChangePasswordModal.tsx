/**
 * ChangePasswordModal — troca de senha do usuário logado.
 */
import { useState, useEffect } from "react";
import { KeyRound, X, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso");
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Falha ao alterar a senha");
    },
  });

  // Limpa os campos quando o modal abre/fecha.
  useEffect(() => {
    if (open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  if (!open) return null;

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 6;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword &&
    !mutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({ currentPassword, newPassword });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#DFFF00]/30 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-[#11131F]" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Alterar senha</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="currentPassword" className="block text-xs font-semibold text-foreground mb-1.5">
              Senha atual
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-lg outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-xs font-semibold text-foreground mb-1.5">
              Nova senha
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-lg outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
            />
            {tooShort && (
              <p className="text-[11px] text-destructive mt-1">Mínimo 6 caracteres.</p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-semibold text-foreground mb-1.5">
              Confirmar nova senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-lg outline-none focus:border-foreground/40 focus:ring-2 focus:ring-[#DFFF00]/40"
            />
            {mismatch && (
              <p className="text-[11px] text-destructive mt-1">As senhas não coincidem.</p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 h-10 px-4 btn-primary text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Salvar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
