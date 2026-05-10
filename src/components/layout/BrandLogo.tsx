import { cn } from "@/lib/utils";

/**
 * Logo officiel du SaaS PharmaPlanning — croix pharmacie verte composée
 * de 5 carrés arrondis. Inline SVG pour rester crisp à toutes les tailles
 * et éviter le round-trip réseau sur le 1er render.
 *
 * Source canonique : /public/pharmaplanning-logo.svg (servi pour les
 * usages externes — email, OG image, favicon).
 */
export function BrandLogo({
  size = 72,
  className,
  withHalo = false,
  /** Surcharge la couleur de la croix (default vert pharma #00A651). */
  color = "#00A651",
}: {
  /** Côté du carré en pixels (default 72). */
  size?: number;
  className?: string;
  /** Active un halo vert pulsant en arrière-plan (style page login). */
  withHalo?: boolean;
  color?: string;
}) {
  return (
    <div className="relative inline-flex">
      {withHalo && (
        <span
          aria-hidden
          className="animate-pulse-glow pointer-events-none absolute inset-0 -m-4 rounded-full bg-gradient-to-br from-emerald-400/55 via-teal-300/35 to-emerald-300/45 blur-xl"
        />
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label="PharmaPlanning"
        className={cn(
          "relative drop-shadow-[0_8px_24px_rgba(16,185,129,0.25)]",
          className
        )}
      >
        <title>PharmaPlanning</title>
        <g fill={color}>
          <rect x="39" y="13" width="22" height="22" rx="3" />
          <rect x="13" y="39" width="22" height="22" rx="3" />
          <rect x="39" y="39" width="22" height="22" rx="3" />
          <rect x="65" y="39" width="22" height="22" rx="3" />
          <rect x="39" y="65" width="22" height="22" rx="3" />
        </g>
      </svg>
    </div>
  );
}
