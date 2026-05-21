import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Login() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
    onError: (err) => {
      toast.error(err.message || "Senha incorreta. Tente novamente.");
      setLoading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    loginMutation.mutate({ password });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center shadow-sm">
          <span className="text-white text-xl font-bold tracking-tight">W</span>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">WaboxApp Monitor</h1>
          <p className="text-sm text-gray-400 mt-0.5">by IRMZ</p>
        </div>
      </div>

      {/* Formulário */}
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-600 mb-1.5">
              Senha de acesso
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all placeholder:text-gray-300"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="h-10 w-full bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Entrando...
              </span>
            ) : (
              "Entrar"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-300 mt-8">
          Painel exclusivo IRMZ — acesso restrito
        </p>
      </div>
    </div>
  );
}
