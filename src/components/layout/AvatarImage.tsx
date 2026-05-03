import Image from "next/image";
import { cn } from "@/lib/utils";
import { getAvatar } from "@/lib/avatars";

/**
 * Avatar utilisateur affiché partout dans l'app.
 *
 * Comportement :
 *  - Si `avatarId` correspond à un avatar du catalogue → affiche le PNG.
 *  - Sinon (null, vide, inconnu) → fallback sur une pastille colorée avec
 *    la 1re lettre du prénom, même pattern que [WeekOverview.tsx](../planning/WeekOverview.tsx).
 *
 * Usage :
 *   <AvatarImage avatarId={user.avatarId} firstName="Sandrine" color="#7c3aed" size={40} />
 */
export function AvatarImage({
  avatarId,
  firstName,
  color,
  size = 40,
  className,
  ringClassName,
}: {
  avatarId?: string | null;
  firstName?: string | null;
  /** Couleur d'affichage (HSL/hex) pour le fallback initiale. */
  color?: string | null;
  /** Taille en px (carré). 40 par défaut. */
  size?: number;
  className?: string;
  /** Classes pour l'anneau extérieur (ex: "ring-2 ring-card"). */
  ringClassName?: string;
}) {
  const avatar = getAvatar(avatarId);
  const initial = (firstName?.[0] ?? "?").toUpperCase();
  const bg = color ?? "#7c3aed";

  // Cas 1 : avatar choisi → PNG dans un disque
  if (avatar) {
    return (
      <div
        className={cn(
          "relative shrink-0 rounded-full overflow-hidden bg-white dark:bg-zinc-100",
          ringClassName,
          className
        )}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Image
          src={avatar.src}
          alt={avatar.label}
          width={size * 2}
          height={size * 2}
          className="h-full w-full object-cover"
          unoptimized
        />
      </div>
    );
  }

  // Cas 2 : fallback initiale colorée (pattern existant de l'app)
  // Taille de la lettre proportionnelle (≈ 38% du diamètre pour rester
  // lisible de 28px à 64px sans avoir à changer de classe).
  const fontPx = Math.max(11, Math.round(size * 0.38));
  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full",
        ringClassName,
        className
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${bg}, ${bg}cc)`,
      }}
      aria-hidden
    >
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold text-white tracking-tight"
        style={{ fontSize: `${fontPx}px` }}
      >
        {initial}
      </span>
    </div>
  );
}
