/**
 * Logo da marca Sougni — usado no header, login, modais.
 *
 * Variantes:
 *  - mark: só o ícone (quadrado lime com s)
 *  - wordmark: só o nome "sougni"
 *  - full: ícone + nome (padrão)
 */

interface SougniLogoProps {
  variant?: "mark" | "wordmark" | "full";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function SougniLogo({ variant = "full", size = "md", className = "" }: SougniLogoProps) {
  const sizes = {
    sm: { mark: 22, wordmark: "text-sm", gap: "gap-1.5" },
    md: { mark: 28, wordmark: "text-base", gap: "gap-2" },
    lg: { mark: 36, wordmark: "text-xl", gap: "gap-2.5" },
    xl: { mark: 48, wordmark: "text-3xl", gap: "gap-3" },
  } as const;

  const s = sizes[size];

  const Mark = (
    <span
      className="inline-flex items-center justify-center rounded-lg flex-shrink-0"
      style={{
        width: s.mark,
        height: s.mark,
        background: "var(--sougni-lime)",
        border: "1px solid var(--sougni-lime-dim)",
      }}
      aria-label="Sougni"
    >
      <span
        className="sougni-wordmark"
        style={{
          fontSize: s.mark * 0.55,
          lineHeight: 1,
          fontWeight: 700,
          color: "var(--sougni-ink)",
          letterSpacing: "-0.04em",
          marginTop: 1,
        }}
      >
        s
      </span>
    </span>
  );

  const Wordmark = (
    <span
      className={`sougni-wordmark ${s.wordmark}`}
      style={{ letterSpacing: "-0.025em" }}
    >
      sougni
    </span>
  );

  if (variant === "mark") return <span className={className}>{Mark}</span>;
  if (variant === "wordmark") return <span className={className}>{Wordmark}</span>;

  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      {Mark}
      {Wordmark}
    </span>
  );
}
