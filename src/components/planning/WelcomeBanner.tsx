"use client";

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarImage } from "@/components/layout/AvatarImage";
import { pickRandomGreeting } from "@/lib/daily-greeting";

/**
 * Bandeau "Bonjour [prénom]" + phrase du jour, affiché en haut du planning.
 *
 * Interactif : tape sur l'avatar pour tirer une nouvelle phrase + petit bounce.
 * Easter egg : 5 clicks rapides (≤ 600 ms entre chaque) → message spécial +
 * bounce dramatique avec sparkles supplémentaires.
 */

/** Phrases spéciales débloquées en spammant l'avatar 5× rapide */
const EASTER_EGG_PHRASES = [
  "🎉 Tu trouves ça drôle hein ? Continue, c'est mignon.",
  "Bug ou feature ? Les deux mon capitaine 🫡",
  "Tu cliques, je clique pas. Tu cliques encore ? OK je m'amuse aussi.",
  "À ce stade c'est presque de la kinésithérapie du doigt.",
  "Tu veux une médaille ? Je t'en donne une 🥇 — voilà.",
  "Le record du jour est de 47 clics. Tu es à combien ?",
];

/** Couleurs des sparkles — cyclées dans la liste */
const SPARKLE_COLORS = ["#a855f7", "#ec4899", "#38bdf8", "#fbbf24", "#10b981", "#f43f5e"];

export function WelcomeBanner({
  firstName,
  hello,
  phrase: initialPhrase,
  color,
  avatarId,
}: {
  firstName: string;
  hello: string;
  phrase: string;
  color?: string | null;
  avatarId?: string | null;
}) {
  const [phrase, setPhrase] = useState(initialPhrase);
  // Compteur d'animation : sert de `key` pour re-trigger les sparkles + bounce
  const [animKey, setAnimKey] = useState(0);
  // True quand on est en mode "easter egg" (anim plus dramatique)
  const [partyMode, setPartyMode] = useState(false);

  // Tracking des clicks rapides (≤ 600 ms entre chaque)
  const lastClickTimeRef = useRef(0);
  const clickStreakRef = useRef(0);

  function handleAvatarClick() {
    const now = Date.now();
    const fast = now - lastClickTimeRef.current < 600;
    lastClickTimeRef.current = now;
    clickStreakRef.current = fast ? clickStreakRef.current + 1 : 1;

    if (clickStreakRef.current >= 5) {
      // Easter egg ! Phrase spéciale + animation party + reset streak
      const eggPhrase =
        EASTER_EGG_PHRASES[Math.floor(Math.random() * EASTER_EGG_PHRASES.length)];
      setPhrase(eggPhrase);
      setPartyMode(true);
      clickStreakRef.current = 0;
    } else {
      setPhrase(pickRandomGreeting());
      setPartyMode(false);
    }
    setAnimKey((k) => k + 1);
  }

  // Génère 6 sparkles (12 en party mode) répartis en cercle autour du centre.
  const sparkleCount = partyMode ? 12 : 6;
  const sparkles = Array.from({ length: sparkleCount }, (_, i) => {
    const angle = (i * 360) / sparkleCount + (partyMode ? 15 : 0);
    const distance = partyMode ? 48 + Math.random() * 16 : 36 + Math.random() * 10;
    const rad = (angle * Math.PI) / 180;
    return {
      tx: Math.cos(rad) * distance,
      ty: Math.sin(rad) * distance,
      color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
    };
  });

  return (
    <section
      aria-label="Bandeau de bienvenue"
      className="no-print rounded-2xl border border-border bg-card/80 backdrop-blur-sm px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.06)]"
    >
      {/* Avatar cliquable — wrapper button pour le focus + accessibilité,
          relative pour positionner les sparkles autour. */}
      <button
        type="button"
        onClick={handleAvatarClick}
        className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        aria-label="Nouvelle phrase du jour"
        title="Cliquez pour une nouvelle phrase"
      >
        <div
          // `key` re-mount le div à chaque click → l'animation se relance.
          key={animKey}
          className={cn(
            partyMode ? "animate-avatar-party" : "animate-avatar-bounce"
          )}
        >
          <AvatarImage
            avatarId={avatarId}
            firstName={firstName}
            color={color}
            size={44}
            ringClassName="ring-2 ring-card shadow-sm"
          />
        </div>

        {/* Sparkles qui partent dans toutes les directions — re-trigger
            l'animation à chaque click via la key. animKey > 0 évite que
            les sparkles s'affichent au mount initial. */}
        {animKey > 0 && (
          <div
            key={`sparkles-${animKey}`}
            aria-hidden
            className="pointer-events-none absolute inset-0"
          >
            {sparkles.map((s, i) => (
              <span
                key={i}
                className="sparkle"
                style={
                  {
                    "--tx": `${s.tx}px`,
                    "--ty": `${s.ty}px`,
                    color: s.color,
                  } as React.CSSProperties
                }
              >
                {/* Petite étoile SVG */}
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-2 w-2">
                  <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
                </svg>
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Texte */}
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] sm:text-[14.5px] font-semibold tracking-tight text-foreground">
          {hello} {firstName} <span className="ml-0.5">👋</span>
        </p>
        {/* `key={phrase}` force le re-mount → animation fade-up replay
            à chaque changement de phrase. */}
        <p
          key={phrase}
          className="animate-fade-up mt-0.5 text-[12px] sm:text-[12.5px] text-muted-foreground leading-relaxed"
        >
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
