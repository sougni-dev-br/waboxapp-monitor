import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { X, Key, ExternalLink, Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface ConfigModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function ConfigModal({ onClose, onSaved }: ConfigModalProps) {
  const { data: config, isLoading } = trpc.config.get.useQuery();
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sincroniza token quando a query retorna (corrige bug: token vazio na primeira abertura)
  useEffect(() => {
    if (config?.token) setToken(config.token);
  }, [config?.token]);

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  const hasChanges = token !== (config?.token ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
              <Key className="w-3.5 h-3.5 text-foreground" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Configurações da integração</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="px-6 py-5 space-y-5">
          {/* Token */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Chave de API do provedor
              {config?.hasToken && !isLoading && (
                <span className="ml-2 text-[10px] font-normal text-emerald-600">● configurada</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={isLoading ? "Carregando..." : "Cole sua chave da API"}
                disabled={isLoading}
                autoComplete="off"
                spellCheck={false}
                className="w-full pl-3.5 pr-10 py-2.5 text-sm font-mono bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-colors disabled:bg-muted"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                aria-label={showToken ? "Ocultar token" : "Mostrar token"}
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Encontre sua chave no painel do{" "}
              <a
                href="https://www.waboxapp.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline inline-flex items-center gap-0.5"
              >
                provedor
                <ExternalLink className="w-3 h-3" />
              </a>
              {" "}de mensageria WhatsApp.
            </p>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              URL do Webhook
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3.5 py-2.5 text-xs text-foreground bg-muted border border-border rounded-lg font-mono truncate select-all">
                {webhookUrl}
              </div>
              <button
                onClick={handleCopy}
                className={`flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                  copied
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title="Copiar URL"
                aria-label="Copiar URL do webhook"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Cole esta URL no campo de webhook de cada canal no painel do provedor.
            </p>
          </div>

          {/* Instruções */}
          <div className="bg-muted rounded-xl p-4 space-y-2 border border-border">
            <p className="text-xs font-medium text-foreground">Como configurar:</p>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Acesse o painel do provedor e copie sua chave da API</li>
              <li>Cole a chave acima e clique em Salvar</li>
              <li>Copie a URL do webhook e configure em cada canal no provedor</li>
              <li>Use o botão <strong className="text-foreground">Adicionar instância</strong> na barra lateral para cadastrar números</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => saveMutation.mutate({ token: token.trim() })}
            disabled={!token.trim() || saveMutation.isPending || !hasChanges}
            className="px-4 py-2 text-sm font-medium btn-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? "Salvando..." : hasChanges ? "Salvar" : "Sem alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
