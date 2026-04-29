"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewModeSelector } from "@/components/planning/ViewModeSelector";
import { startOfWeek, toIsoDate } from "@/lib/planning-utils";

/**
 * En-tête de la vue mois — navigation au mois (≠ semaine pour les autres vues).
 * Pour le ViewModeSelector, on convertit le mois en lundi de la 1re semaine
 * du mois (pour atterrir sur une période cohérente).
 */
export function MonthHeader({ monthStart }: { monthStart: string }) {
  const router = useRouter();
  const month = new Date(`${monthStart}T00:00:00`);
  const monthLabel = month.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  function go(delta: number) {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    next.setDate(1);
    router.push(`/planning/mois?month=${monthIso(next)}`);
  }

  function goThisMonth() {
    const t = new Date();
    t.setDate(1);
    router.push(`/planning/mois?month=${monthIso(t)}`);
  }

  // Pour le sélecteur Jour/Semaine : on retombe sur la 1re semaine du mois.
  const weekAnchor = toIsoDate(startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1)));

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          Vue mois
        </h1>
        <p className="mt-0.5 text-sm capitalize text-muted-foreground">
          {monthLabel}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 no-print">
        <ViewModeSelector current="month" weekStart={weekAnchor} />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(-1)}
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goThisMonth}>
            Ce mois
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(1)}
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function monthIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
