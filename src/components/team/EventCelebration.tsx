"use client";

import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEAM_EVENT_CONFETTI } from "@/lib/team-event-style";
import type { TeamEventType } from "@/validators/team-event";

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
  const label =
    events.length === 1
      ? `Aujourd'hui : ${events[0].title}`
      : `${events.length} moments d'équipe aujourd'hui`;

  return (
    <div
      className={cn(
        "no-print relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-rose-50 to-violet-50 px-4 py-3 shadow-sm dark:border-amber-900/40 dark:from-amber-950/25 dark:via-rose-950/20 dark:to-violet-950/25",
        className
      )}
    >
      {mounted && <EventConfetti colors={colors} />}
      <div className="relative z-[1] flex items-center justify-center gap-2 text-center text-[13.5px] font-semibold text-foreground">
        <PartyPopper className="h-4 w-4 shrink-0 text-amber-500 tev-bob" />
        <span>🎉 {label} — profitez-en&nbsp;!</span>
      </div>
    </div>
  );
}