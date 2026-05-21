import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";
import { SougniLogo } from "@/components/SougniLogo";

export default function Login() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
    onError: (err) => {
      const msg = err.message || "Senha incorreta. Tente novamente.";
      setError(msg);
      toast.error(msg);
      setLoading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError(null);
    setLoading(true);
    loginMutation.mutate({ password });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Decoração sutil de fundo: gradiente lime no canto */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 100% 0%, var(--sougni-lime-soft) 0%, transparent 45%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <SougniLogo variant="mark" size="xl" />
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight sougni-wordmark">
              sougni
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Painel de canais WhatsApp
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-foreground mb-2"
              >
                Senha de acesso
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Digite sua senha"
                  autoFocus
                  autoComplete="current-password"
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  className={`w-full h-11 pl-3.5 pr-10 text-sm bg-background border rounded-lg outline-none transition-all ${
                    error
                      ? "border-destructive/40 focus:border-destructive focus:ring-2 focus:ring-destructive/10"
                      : "border-border focus:border-foreground/30 focus:ring-2 focus:ring-foreground/5"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              {error && (
                <p
                  id="login-error"
                  className="flex items-center gap-1.5 mt-2 text-xs text-destructive"
                >
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="group h-11 w-full btn-primary text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Acesso restrito · uso interno
        </p>
      </div>
    </div>
  );
}
