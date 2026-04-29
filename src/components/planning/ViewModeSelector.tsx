"use client";

import Link from "next/link";
import { CalendarDays, CalendarRange, Grid3x3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "day" | "week" | "month";

const MODES: Array<{
  mode: ViewMode;
  label: string;
  icon: typeof CalendarDays;
  pathFor: (week: string) => string;
}> = [
  {
    mode: "day",
    label: "Jour",
    icon: CalendarDays,
    pathFor: (week) => `/planning?week=${week}`,
  },
  {
    mode: "week",
    label: "Semaine",
    icon: Grid3x3,
    pathFor: (week) => `/planning/semaine?week=${week}`,
  },
  {
    mode: "month",
    label: "Mois",
    icon: CalendarRange,
    // Le mois contenant cette semaine — format YYYY-MM
    pathFor: (week) => `/planning/mois?month=${week.slice(0, 7)}`,
  },
];

/**
 * Sélecteur de vue Jour / Semaine / Mois.
 * Préserve la semaine courante dans l'URL pour rester sur la même période
 * lors du changement de vue.
 */
export function ViewModeSelector({
  current,
  weekStart,
}: {
  current: ViewMode;
  weekStart: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Mode d'affichage du planning"
      className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100/80 p-1 ring-1 ring-inset ring-zinc-200/70 no-print"
    >
      {MODES.map(({ mode, label, icon: Icon, pathFor }) => {
        const active = mode === current;
        return (
          <Link
            key={mode}
            href={pathFor(weekStart)}
            role="tab"
            aria-selected={active}
            prefetch
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200",
              active
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/60"
                : "text-zinc-600 hover:text-zinc-900"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
