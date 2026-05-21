import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { X, Key, ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface ConfigModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function ConfigModal({ onClose, onSaved }: ConfigModalProps) {
  const { data: config } = trpc.config.get.useQuery();
  const [token, setToken] = useState(config?.token ?? "");
  const [copied, setCopied] = useState(false);

  const saveMutation = trpc.config.save.useMutation({
    onSuccess: () => {
      toast.success("Token salvo com sucesso!");
      onSaved();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/waboxapp`
      : "/api/webhook/waboxapp";

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
              <Key className="w-3.5 h-3.5 text-gray-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Configurações da API</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="px-6 py-5 space-y-5">
          {/* Token */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Token da API WaboxApp
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Seu token da API WaboxApp"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Encontre seu token em{" "}
              <a
                href="https://www.waboxapp.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 underline inline-flex items-center gap-0.5"
              >
                waboxapp.com
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              URL do Webhook (configure no WaboxApp)
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3.5 py-2.5 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg font-mono truncate">
                {webhookUrl}
              </div>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Configure esta URL no painel WaboxApp para receber mensagens em tempo real.
            </p>
          </div>

          {/* Instruções */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-gray-700">Como configurar:</p>
            <ol className="text-xs text-gray-500 space-y-1.5 list-decimal list-inside">
              <li>Acesse waboxapp.com e copie seu token de API</li>
              <li>Cole o token acima e salve</li>
              <li>Copie a URL do webhook e configure em cada instância no WaboxApp</li>
              <li>Adicione suas instâncias clicando em + na barra lateral</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => saveMutation.mutate({ token })}
            disabled={!token.trim() || saveMutation.isPending}
            className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
