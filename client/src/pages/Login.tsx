/**
 * Tela de login — split screen com painel de branding à esquerda
 * e formulário (username + senha) à direita. Inspirado em padrões 21st.dev.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck, User, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { SougniLogo } from "@/components/SougniLogo";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      toast.success(`Bem-vindo, ${data.user.name ?? data.user.username}!`);
      // Reload pra trazer todas as queries autenticadas com user real
      window.location.reload();
    },
    onError: (err) => {
      const msg = err.message || "Usuário ou senha incorretos.";
      setError(msg);
      toast.error(msg);
      setLoading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setError(null);
    setLoading(true);
    loginMutation.mutate({ username: username.trim().toLowerCase(), password });
  };

  return (
    <div className="min-h-screen w-full flex bg-[#FAFAF7]">
      {/* ─── Painel esquerdo: branding ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[44%] relative overflow-hidden bg-[#11131F]">
        {/* Gradient lime no fundo */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(at 0% 0%, rgba(223,255,0,0.18) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(223,255,0,0.10) 0px, transparent 50%)",
          }}
        />
        {/* Grade decorativa */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Glow lime grande */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -bottom-32 -left-32 w-[420px] h-[420px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, #DFFF00 0%, transparent 70%)", opacity: 0.18 }}
        />

        <div className="relative z-10 flex flex-col justify-between p-12 lg:p-14 w-full text-white">
          {/* Logo top */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex items-center gap-3"
          >
            <SougniLogo variant="mark" size="md" />
            <span className="text-2xl font-semibold tracking-tight sougni-wordmark">sougni</span>
          </motion.div>

          {/* Tagline central */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-md"
          >
            <p className="text-[11px] uppercase tracking-[0.25em] text-[#DFFF00] font-semibold mb-4">
              Painel operacional
            </p>
            <h1 className="text-4xl lg:text-5xl font-semibold leading-[1.05] tracking-tight">
              Inteligência <span className="text-[#DFFF00]">cirúrgica</span><br />
              para sua clínica.
            </h1>
            <p className="mt-6 text-base text-white/70 leading-relaxed">
              Acompanhe leads, agendamentos e cirurgias em tempo real.
              Tudo o que sua operação precisa, num só painel.
            </p>
          </motion.div>

          {/* Rodapé com features */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/50"
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#DFFF00]" />
              Sessão protegida
            </span>
            <span>·</span>
            <span>Dados criptografados</span>
            <span>·</span>
            <span>Sougni © 2026</span>
          </motion.div>
        </div>
      </div>

      {/* ─── Painel direito: form ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative">
        {/* Glow lime mobile */}
        <div
          aria-hidden
          className="lg:hidden pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 100% 0%, var(--sougni-lime-soft) 0%, transparent 50%)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-sm"
        >
          {/* Logo mobile (visível só em <lg) */}
          <div className="lg:hidden mb-10 flex flex-col items-center gap-3">
            <SougniLogo variant="mark" size="xl" />
            <span className="text-xl font-semibold sougni-wordmark">sougni</span>
          </div>

          {/* Saudação */}
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#11131F]/50 font-semibold">
              Bem-vindo
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#11131F]">
              Entre na sua conta
            </h2>
            <p className="mt-2 text-sm text-[#11131F]/60">
              Use seu usuário e senha para acessar o painel.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-[#11131F] mb-1.5">
                Usuário
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#11131F]/40 pointer-events-none" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="rafael"
                  autoFocus
                  autoComplete="username"
                  spellCheck={false}
                  className={`w-full h-12 pl-10 pr-3 text-sm bg-white border rounded-xl outline-none transition-all placeholder:text-[#11131F]/30 ${
                    error
                      ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      : "border-[#11131F]/15 focus:border-[#11131F] focus:ring-2 focus:ring-[#DFFF00]/40"
                  }`}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-[#11131F]">
                  Senha
                </label>
                <span className="text-[11px] text-[#11131F]/40">Acesso restrito</span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#11131F]/40 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  className={`w-full h-12 pl-10 pr-11 text-sm bg-white border rounded-xl outline-none transition-all placeholder:text-[#11131F]/30 ${
                    error
                      ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      : "border-[#11131F]/15 focus:border-[#11131F] focus:ring-2 focus:ring-[#DFFF00]/40"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#11131F]/40 hover:text-[#11131F] rounded-lg transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && (
                <p id="login-error" className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="group relative h-12 w-full overflow-hidden rounded-xl bg-[#11131F] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-[#11131F]/15"
            >
              {/* Halo lime no hover */}
              <span
                aria-hidden
                className="absolute inset-0 -z-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  background:
                    "radial-gradient(circle at 50% 100%, rgba(223,255,0,0.25) 0%, transparent 60%)",
                }}
              />
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar no painel
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-[11px] text-[#11131F]/40 mt-8">
            Problemas para acessar? Fale com o administrador do painel.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
