import { Sparkles } from "lucide-react";
import { AvatarImage } from "@/components/layout/AvatarImage";

/**
 * Bandeau "Bonjour [prénom]" + phrase du jour, affiché en haut du planning.
 *
 * L'avatar : si l'utilisateur a choisi un perso (User.avatarId), on l'affiche
 * en PNG. Sinon fallback sur la pastille colorée avec la 1re lettre du prénom
 * (même pattern que le reste de l'app).
 */
export function WelcomeBanner({
  firstName,
  hello,
  phrase,
  color,
  avatarId,
}: {
  /** Prénom affiché dans la salutation. */
  firstName: string;
  /** Préfixe de salutation : "Bonjour", "Bonsoir"… selon l'heure. */
  hello: string;
  /** Phrase du jour. */
  phrase: string;
  /** Couleur d'affichage du collaborateur (HSL/hex). Fallback si pas d'employee. */
  color?: string | null;
  /** ID d'avatar choisi par l'utilisateur — null = fallback initiale. */
  avatarId?: string | null;
}) {
  return (
    <section
      aria-label="Bandeau de bienvenue"
      className="no-print rounded-2xl border border-border bg-card/80 backdrop-blur-sm px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.06)]"
    >
      <AvatarImage
        avatarId={avatarId}
        firstName={firstName}
        color={color}
        size={44}
        ringClassName="ring-2 ring-card shadow-sm"
      />

      {/* Texte */}
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] sm:text-[14.5px] font-semibold tracking-tight text-foreground">
          {hello} {firstName} <span className="ml-0.5">👋</span>
        </p>
        <p className="mt-0.5 text-[12px] sm:text-[12.5px] text-muted-foreground leading-relaxed">
          {phrase}
        </p>
      </div>

      {/* Ornement discret — pictogramme côté droit (caché sur mobile) */}
      <Sparkles
        className="hidden sm:block h-4 w-4 shrink-0 text-violet-500/70"
        aria-hidden
      />
    </section>
  );
}
