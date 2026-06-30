"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Coffee, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type DayBlock = { from: string; to: string; label: string; isAbsence: boolean };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Carte "Ma journée" de l'Accueil. Côté client pour surligner le créneau EN
 * COURS (heure locale du navigateur) et indiquer le prochain à venir.
 */
export function MyDayCard({
  hours,
  blocks,
  nextSlot,
}: {
  hours: number;
  blocks: DayBlock[];
  /** Prochain créneau à venir (affiché quand on est en repos aujourd'hui). */
  nextSlot?: { when: string; from: string; label: string } | null;
}) {
  const { currentIdx, nextIdx } = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let currentIdx = -1;
    let nextIdx = -1;
    blocks.forEach((b, i) => {
      if (toMin(b.from) <= nowMin && nowMin < toMin(b.to)) currentIdx = i;
    });
    if (currentIdx === -1) {
      nextIdx = blocks.findIndex((b) => toMin(b.from) > nowMin);
    }
    return { currentIdx, nextIdx };
  }, [blocks]);

  return (
    <Link
      href="/planning"
      className="block rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/70">
          Ma journée
        </h2>
        <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">
          {hours > 0 ? `${hours % 1 === 0 ? hours : hours.toFixed(1)}h` : ""}
        </span>
      </div>

      {blocks.length === 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-foreground">
            <Coffee className="h-5 w-5 text-amber-500/80 shrink-0" />
            <span className="text-[14px] font-medium">Repos aujourd'hui — profite !</span>
          </div>
          {nextSlot && (
            <p className="text-[12.5px] text-muted-foreground pl-7">
              Prochain créneau :{" "}
              <span className="font-medium text-foreground capitalize">{nextSlot.when}</span>{" "}
              <span className="font-mono tabular-nums">{nextSlot.from}</span> · {nextSlot.label}
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-1">
          {blocks.map((b, i) => {
            const isCurrent = i === currentIdx;
            const isNext = i === nextIdx;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 text-[13.5px]",
                  isCurrent && "bg-violet-100/70 dark:bg-violet-900/30"
                )}
              >
                <span className="font-mono tabular-nums text-muted-foreground w-[92px] shrink-0">
                  {b.from}–{b.to}
                </span>
                <span
                  className={cn(
                    "font-medium flex-1 min-w-0 truncate",
                    b.isAbsence ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                  )}
                >
                  {b.label}
                </span>
                {isCurrent && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-600 text-white px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.04em]">
                    <span className="h-1 w-1 rounded-full bg-white animate-pulse" aria-hidden />
                    En cours
                  </span>
                )}
                {isNext && (
                  <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-violet-500/80">
                    À venir
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2.5 flex items-center gap-1 text-[12px] font-medium text-violet-600 dark:text-violet-400">
        Voir le planning <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}
