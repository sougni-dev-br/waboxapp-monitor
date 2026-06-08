/**
 * Logo da marca Sougni — usado no header, login, modais, favicon.
 *
 * Visual: hexágono lime + cubo isométrico preto wireframe.
 * Animação CSS sutil (float vertical + pulse leve) — sem GIF, sem JS,
 * suave e leve.
 *
 * Asset: `client/public/sougni-mark.jpg` (servido na raiz do site).
 *
 * Variantes:
 *   - mark:     só o ícone (hexágono animado)
 *   - wordmark: só o nome "sougni"
 *   - full:     ícone + nome (padrão)
 */

interface SougniLogoProps {
  variant?: "mark" | "wordmark" | "full";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Desliga animação (útil em locais menores) */
  static?: boolean;
  alt?: string;
}

const SIZES = {
  sm: { mark: 24, wordmark: "text-sm", gap: "gap-1.5" },
  md: { mark: 32, wordmark: "text-base", gap: "gap-2" },
  lg: { mark: 44, wordmark: "text-xl", gap: "gap-2.5" },
  xl: { mark: 64, wordmark: "text-3xl", gap: "gap-3" },
} as const;

export function SougniLogo({
  variant = "full",
  size = "md",
  className = "",
  static: isStatic = false,
  alt = "Sougni",
}: SougniLogoProps) {
  const s = SIZES[size];

  const Mark = (
    <img
      src="/sougni-mark.jpg"
      alt={alt}
      width={s.mark}
      height={s.mark}
      draggable={false}
      className={`flex-shrink-0 select-none rounded-lg ${isStatic ? "" : "sougni-mark-anim"}`}
      style={{ width: s.mark, height: s.mark, objectFit: "contain" }}
    />
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
