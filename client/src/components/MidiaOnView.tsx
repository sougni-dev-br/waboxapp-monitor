/**
 * Criativos — view de relatórios de mídia/marketing (Reportei embed).
 * Carrega um dashboard externo (Reportei) via iframe ocupando toda a área central.
 */
import { Megaphone, ExternalLink, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

const REPORTEI_EMBED_URL = "https://app.reportei.com/embed/LVt1EbhV2liTZHRfUHkxs6fIYMHpvVaF";

export function MidiaOnView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleReload = () => {
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--sougni-lime-soft)" }}
          >
            <Megaphone className="w-4 h-4" style={{ color: "var(--sougni-ink)" }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">Criativos</h2>
            <p className="text-[11px] text-muted-foreground truncate">
              Relatório de performance · atualização em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleReload}
            title="Recarregar relatório"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={REPORTEI_EMBED_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir em nova aba"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir em nova aba
          </a>
        </div>
      </div>

      {/* Iframe ocupando todo o espaço restante */}
      <div className="flex-1 overflow-hidden bg-card">
        <iframe
          key={reloadKey}
          ref={iframeRef}
          title="Criativos — Reportei"
          src={REPORTEI_EMBED_URL}
          className="w-full h-full block"
          style={{ border: 0, background: "white" }}
          allow="fullscreen; clipboard-write"
          loading="eager"
        />
      </div>
    </div>
  );
}
