"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ViewModeSelector,
  type ViewMode,
} from "@/components/planning/ViewModeSelector";
import {
  isoWeekNumber,
  startOfWeek,
  toIsoDate,
  weekTypeFor,
} from "@/lib/planning-utils";

/**
 * En-tête commun aux trois vues planning (jour / semaine / mois).
 * Gère la navigation de semaine et le sélecteur de vue.
 */
export function PlanningHeader({
  weekStart,
  mode,
  title,
  subtitle,
  basePath,
}: {
  weekStart: string;
  mode: ViewMode;
  title: string;
  subtitle?: string;
  /** Path de base pour la navigation prev/next (ex: /planning/semaine) */
  basePath: string;
}) {
  const router = useRouter();
  const monday = new Date(`${weekStart}T00:00:00`);
  const weekNumber = isoWeekNumber(monday);
  const weekKind = weekTypeFor(monday);

  function go(delta: number) {
    const next = new Date(monday);
    next.setDate(next.getDate() + delta * 7);
    const iso = toIsoDate(next);
    router.push(`${basePath}?week=${iso}`);
  }

  function goToday() {
    const iso = toIsoDate(startOfWeek(new Date()));
    router.push(`${basePath}?week=${iso}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {subtitle ?? (
            <>
              Semaine {weekNumber} ·{" "}
              <span className="font-medium text-violet-600">{weekKind}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 no-print">
        <ViewModeSelector current={mode} weekStart={weekStart} />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(-1)}
            aria-label="Semaine précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Aujourd&apos;hui
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(1)}
            aria-label="Semaine suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
