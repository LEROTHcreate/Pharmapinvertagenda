"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvatarImage } from "@/components/layout/AvatarImage";
import { pickRandomGreeting } from "@/lib/daily-greeting";
import type { PlanningTip } from "@/lib/planning-tips";

/** Clé localStorage : signature des conseils déjà consultés (stoppe le pulse). */
const TIPS_SEEN_KEY = "pp_tips_seen";

/**
 * Bandeau "Bonjour [prénom]" + phrase du jour, affiché en haut du planning.
 *
 * Interactif : tape sur l'avatar pour tirer une nouvelle phrase + petit bounce.
 * Easter egg : 5 clicks rapides (≤ 600 ms entre chaque) → message spécial +
 * bounce dramatique avec sparkles supplémentaires.
 *
 * Ampoule "conseils" : ouvre un panneau (DropdownMenu Radix) listant les tips
 * contextuels de la semaine. Le panneau est portalisé et anti-collision → il
 * reste TOUJOURS dans l'écran (hauteur bornée + scroll interne), contrairement
 * à l'ancienne bulle positionnée en absolu qui débordait en bas de page.
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

  // ─── Ampoule "conseils" ───────────────────────────────────────────
  // Signature du lot de conseils courant : quand elle change (nouvelle
  // semaine, nouveaux tips), l'ampoule se remet à pulser pour signaler qu'il
  // y a du nouveau. Une fois le panneau ouvert, on mémorise la signature →
  // plus de pulse tant que les conseils ne changent pas.
  const tipsSig = useMemo(
    () => tips.map((t) => `${t.date}:${t.level}`).join("|"),
    [tips]
  );
  const [seen, setSeen] = useState(true); // true par défaut → pas de flash au SSR

  useEffect(() => {
    if (!tipsSig) return;
    try {
      setSeen(window.localStorage.getItem(TIPS_SEEN_KEY) === tipsSig);
    } catch {
      setSeen(false);
    }
  }, [tipsSig]);

  function markSeen() {
    setSeen(true);
    try {
      window.localStorage.setItem(TIPS_SEEN_KEY, tipsSig);
    } catch {
      /* stockage indisponible (mode privé) → on ignore */
    }
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
      className="no-print relative rounded-2xl border border-border bg-card md:bg-card/80 md:backdrop-blur-sm px-4 py-2.5 pr-14 sm:px-5 sm:py-3 sm:pr-16 flex items-center gap-3 sm:gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.06)]"
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

      {/* Ampoule "conseils" pinnée au coin droit du bandeau. Le panneau est
          rendu par Radix (portal + anti-collision) → jamais de débordement. */}
      {tips.length > 0 ? (
        <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2">
          <DropdownMenu onOpenChange={(o) => o && markSeen()}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${tips.length} conseil${tips.length > 1 ? "s" : ""} pour la semaine`}
                className={cn(
                  "relative inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  "text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                  "data-[state=open]:bg-amber-50 dark:data-[state=open]:bg-amber-950/40 data-[state=open]:text-amber-600"
                )}
                title={`${tips.length} conseil${tips.length > 1 ? "s" : ""} pour la semaine`}
              >
                <Lightbulb className="h-4 w-4" />
                {/* Pastille pulsante tant que les conseils du moment n'ont pas
                    été ouverts (signature en localStorage). */}
                {!seen && (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-card" />
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={8}
              // Hauteur bornée à l'espace dispo à l'écran (var fournie par
              // Radix) → le panneau ne déborde jamais, la liste scrolle.
              className="flex max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height,26rem))] w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-hidden p-0 border-amber-200 dark:border-amber-800/60 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.22)]"
            >
              {/* En-tête */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                  <Lightbulb className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold leading-tight text-foreground">
                    À prévoir cette semaine
                  </p>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {tips.length} point{tips.length > 1 ? "s" : ""} pour anticiper l&apos;affluence
                  </p>
                </div>
              </div>

              {/* Liste scrollable */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 scrollbar-thin">
                <ul className="space-y-1.5">
                  {tips.map((tip, i) => {
                    const warn = tip.level === "warning";
                    const Icon = warn ? AlertTriangle : CalendarClock;
                    return (
                      <li
                        key={`${tip.date}-${i}`}
                        className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                            warn
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                              : "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold leading-snug text-foreground">
                            {tip.title}
                          </p>
                          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                            {tip.description}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        // Ampoule "inactive" (sans conseil) — pinnée au même endroit pour
        // garantir une position visuelle stable peu importe l'état.
        <Lightbulb
          className="hidden sm:block absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500/40"
          aria-hidden
        />
      )}
    </section>
  );
}
