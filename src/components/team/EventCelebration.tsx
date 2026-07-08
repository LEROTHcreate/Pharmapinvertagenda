"use client";

import { useEffect, useState } from "react";
import {
  PartyPopper,
  UtensilsCrossed,
  Sparkles,
  Handshake,
  GraduationCap,
  MessagesSquare,
  CalendarHeart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TEAM_EVENT_CONFETTI } from "@/lib/team-event-style";
import type { TeamEventType } from "@/validators/team-event";

/** Icône + libellé court par type d'événement (pour le bandeau du jour). */
const TYPE_META: Record<TeamEventType, { icon: LucideIcon; label: string }> = {
  REPAS: { icon: UtensilsCrossed, label: "Repas d'équipe" },
  ANIMATION_LABO: { icon: Sparkles, label: "Animation labo" },
  REUNION_FOURNISSEUR: { icon: Handshake, label: "Réunion fournisseur" },
  ENTRETIEN: { icon: MessagesSquare, label: "Entretien" },
  FORMATION: { icon: GraduationCap, label: "Formation" },
  AUTRE: { icon: CalendarHeart, label: "Événement" },
};

type Piece = {
  left: number;
  delay: number;
  dur: number;
  color: string;
  size: number;
  round: boolean;
  drift: number;
};

/**
 * Pluie de confettis (le jour d'un événement). Générée après montage → pas
 * d'écart d'hydratation dû au hasard. Coupée si « animations réduites ».
 */
export function EventConfetti({ colors }: { colors: string[] }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    if (colors.length === 0) {
      setPieces([]);
      return;
    }
    setPieces(
      Array.from({ length: 34 }, (_, i) => ({
        left: Math.round(Math.random() * 100),
        delay: Math.round(Math.random() * 5000) / 1000,
        dur: 3 + Math.round(Math.random() * 3000) / 1000,
        color: colors[i % colors.length],
        size: 5 + Math.round(Math.random() * 5),
        round: Math.random() > 0.55,
        drift: Math.round((Math.random() * 2 - 1) * 30),
      }))
    );
  }, [colors]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden motion-reduce:hidden"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn(
            "tev-confetti absolute top-0 block",
            p.round ? "rounded-full" : "rounded-[1px]"
          )}
          style={
            {
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.round ? p.size : Math.round(p.size * 0.5)}px`,
              backgroundColor: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              ["--drift"]: `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Petite fête « jour d'événement » — bandeau + confettis. Affichée sur l'accueil
 * et en bas du planning quand un ou plusieurs événements d'équipe ont lieu
 * aujourd'hui. Ne rend rien s'il n'y en a pas.
 */
export function TodayEventCelebration({
  events,
  className,
}: {
  events: { title: string; type: TeamEventType }[];
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (events.length === 0) return null;

  const colors = Array.from(
    new Set(events.flatMap((e) => TEAM_EVENT_CONFETTI[e.type]))
  );
  const single = events.length === 1 ? events[0] : null;
  const meta = single ? TYPE_META[single.type] : null;
  const Icon = meta?.icon ?? PartyPopper;

  return (
    <div
      className={cn(
        "no-print relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-rose-50 to-violet-50 px-4 py-3 shadow-sm dark:border-amber-900/40 dark:from-amber-950/25 dark:via-rose-950/20 dark:to-violet-950/25",
        className
      )}
    >
      {mounted && <EventConfetti colors={colors} />}
      <div className="relative z-[1] flex items-center justify-center gap-3">
        <span className="tev-bob flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-amber-600 ring-1 ring-amber-200/80 dark:bg-white/10 dark:text-amber-300 dark:ring-amber-900/50">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/80 dark:text-amber-300/75">
            Aujourd&apos;hui
          </p>
          <p className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            <span className="truncate">
              {single ? single.title : `${events.length} moments d'équipe`}
            </span>
            {meta && (
              <span className="hidden shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-medium text-foreground/65 ring-1 ring-black/5 sm:inline dark:bg-white/10 dark:text-foreground/70 dark:ring-white/10">
                {meta.label}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}