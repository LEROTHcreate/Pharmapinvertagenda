"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarImage } from "@/components/layout/AvatarImage";
import { pickRandomGreeting } from "@/lib/daily-greeting";
import type { PlanningTip } from "@/lib/planning-tips";

/** Délai avant auto-hide de la bulle de tip à l'ouverture du site (ms). */
const BUBBLE_AUTO_HIDE_MS = 9000;

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
  tips = [],
}: {
  firstName: string;
  hello: string;
  phrase: string;
  color?: string | null;
  avatarId?: string | null;
  /** Tips contextuels (pont, veille de férié…) sur les 7 prochains jours. */
  tips?: PlanningTip[];
}) {
  const [phrase, setPhrase] = useState(initialPhrase);
  // Compteur d'animation : sert de `key` pour re-trigger les sparkles + bounce
  const [animKey, setAnimKey] = useState(0);
  // True quand on est en mode "easter egg" (anim plus dramatique)
  const [partyMode, setPartyMode] = useState(false);

  // Tracking des clicks rapides (≤ 600 ms entre chaque)
  const lastClickTimeRef = useRef(0);
  const clickStreakRef = useRef(0);

  // ─── Bulle de tip ─────────────────────────────────────────────────
  // À l'arrivée sur la page, si on a au moins un tip, on ouvre la bulle
  // automatiquement. Elle s'efface seule après BUBBLE_AUTO_HIDE_MS, ou
  // immédiatement si l'utilisateur clique dessus / sur l'ampoule. Un
  // re-clic sur l'ampoule la ré-ouvre (sans timer cette fois — c'est
  // intentionnel, l'utilisateur l'a demandée).
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tips.length === 0) return;
    setBubbleOpen(true);
    hideTimerRef.current = setTimeout(() => {
      setBubbleOpen(false);
    }, BUBBLE_AUTO_HIDE_MS);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [tips.length]);

  function dismissBubble() {
    setBubbleOpen(false);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }
  function toggleBubble() {
    if (bubbleOpen) dismissBubble();
    else setBubbleOpen(true);
  }

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
      // `relative` permet de pin l'ampoule en position absolue dans le coin
      // droit, indépendamment du flux flex — comme ça le contenu (avatar +
      // texte) peut grandir/rétrécir sans jamais décaler l'ampoule.
      // `pr-14` réserve 56px à droite pour que le texte ne passe pas dessous.
      className="no-print relative rounded-2xl border border-border bg-card/80 backdrop-blur-sm px-4 py-3 pr-14 sm:px-5 sm:py-4 sm:pr-16 flex items-center gap-3 sm:gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.06)]"
    >
      {/* Avatar cliquable — wrapper button pour le focus + accessibilité,
          relative pour positionner les sparkles autour.
          Dimensions FIGÉES (44×44 = h-11 w-11) pour que les animations scale
          n'affectent jamais la layout box → l'ampoule à droite ne bouge
          plus, même pendant le bounce/party. `contain: layout` isole le
          rendu pour empêcher tout reflow extérieur. */}
      <button
        type="button"
        onClick={handleAvatarClick}
        className="relative shrink-0 h-11 w-11 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        style={{ contain: "layout" }}
        aria-label="Nouvelle phrase du jour"
        title="Cliquez pour une nouvelle phrase"
      >
        <div
          // `key` re-mount le div à chaque click → l'animation se relance.
          key={animKey}
          className={cn(
            "h-11 w-11",
            partyMode ? "animate-avatar-party" : "animate-avatar-bounce"
          )}
          style={{ transformOrigin: "center center" }}
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

      {/* Ampoule pinnée en position absolue au coin droit du bandeau.
          Indépendante du flux flex → l'avatar et le texte peuvent
          grandir/rétrécir, l'ampoule ne bouge plus jamais. */}
      {tips.length > 0 ? (
        <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={toggleBubble}
            aria-label={`${tips.length} info${tips.length > 1 ? "s" : ""} à venir`}
            aria-expanded={bubbleOpen}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            title={`${tips.length} info${tips.length > 1 ? "s" : ""} à venir`}
          >
            <Lightbulb className="h-4 w-4" />
            {!bubbleOpen && (
              <span
                className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"
                aria-hidden
              />
            )}
          </button>

          {bubbleOpen && (
            <div
              role="button"
              tabIndex={0}
              onClick={dismissBubble}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
                  e.preventDefault();
                  dismissBubble();
                }
              }}
              className={cn(
                "comic-bubble",
                // right-0 = on aligne le bord droit de la bulle avec le bord
                // droit du conteneur de l'ampoule. Combiné aux nouvelles
                // valeurs CSS du triangle, la flèche pointe pile sur l'ampoule.
                "absolute right-0 top-full mt-3 z-30 w-[280px] sm:w-[320px]",
                "rounded-2xl border-2 border-amber-300 dark:border-amber-700",
                "bg-card px-4 py-3 pr-8 text-left shadow-[0_8px_28px_-6px_rgba(0,0,0,0.18)]",
                "animate-bubble-pop cursor-pointer select-none",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              )}
              aria-label="Tips à prévoir cette semaine. Cliquer pour fermer."
            >
              {/* Croix de fermeture en coin — purement visuelle, le clic se
                  fait sur toute la bulle pour rester accessible au tap. */}
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </span>

              <div className="flex items-center gap-1.5 mb-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-amber-700 dark:text-amber-400">
                  À prévoir cette semaine
                </p>
              </div>

              <ul className="space-y-2">
                {tips.map((tip) => (
                  <li key={tip.date} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 inline-flex h-1.5 w-1.5 shrink-0 rounded-full",
                        tip.level === "warning"
                          ? "bg-amber-500"
                          : "bg-violet-500"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-foreground leading-tight">
                        {tip.title}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground leading-snug">
                        {tip.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        // Ampoule "inactive" (sans tips) — pinnée au même endroit pour
        // garantir une position visuelle stable peu importe l'état.
        <Lightbulb
          className="hidden sm:block absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500/40"
          aria-hidden
        />
      )}
    </section>
  );
}
