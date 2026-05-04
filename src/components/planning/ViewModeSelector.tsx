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
    // Mois cible : on prend SAMEDI (fin de semaine) plutôt que le lundi.
    // Pour une semaine chevauchant 2 mois (ex. lun. 27 avril → sam. 2 mai),
    // c'est le mois d'aujourd'hui (mai) que l'utilisateur attend, pas
    // celui du lundi (avril). Samedi → toujours dans le mois "principal"
    // de la semaine du point de vue utilisateur.
    pathFor: (week) => {
      const monday = new Date(`${week}T00:00:00`);
      const saturday = new Date(monday);
      saturday.setDate(monday.getDate() + 5);
      const yyyy = saturday.getFullYear();
      const mm = String(saturday.getMonth() + 1).padStart(2, "0");
      return `/planning/mois?month=${yyyy}-${mm}`;
    },
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
      className="inline-flex items-center gap-0.5 rounded-full bg-muted/40 p-1 ring-1 ring-inset ring-border no-print"
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
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-foreground/70 hover:text-foreground"
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
