"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayCoverage } from "@/lib/planning-utils";

/** Nombre de créneaux de 30 min dans une plage "HH:MM"→"HH:MM". */
function rangeSlots(from: string, to: string): number {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  return Math.max(1, Math.round((toMin(to) - toMin(from)) / 30));
}

/**
 * Récap couverture — bandeau compact au-dessus de la grille planning. Résume en
 * une ligne les créneaux en SOUS-EFFECTIF de la semaine (colonne EFF < seuil),
 * et se déplie pour lister les plages par jour. Chaque plage est cliquable →
 * saute directement au jour concerné. N'affiche RIEN si tout est couvert.
 */
export function CoverageRecap({
  days,
  weekDayLabels,
  minStaff,
  onJump,
}: {
  days: DayCoverage[];
  /** Libellés Lun→Sam (index = dayIndex). Tuple readonly accepté. */
  weekDayLabels: readonly string[];
  minStaff: number;
  onJump: (dayIndex: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (days.length === 0) return null;

  const totalSlots = days.reduce(
    (s, d) => s + d.holes.reduce((a, h) => a + rangeSlots(h.from, h.to), 0),
    0
  );
  const anyCritical = days.some((d) =>
    d.holes.some((h) => h.level === "critical")
  );

  return (
    <div
      className={cn(
        "no-print rounded-xl border text-[12.5px]",
        anyCritical
          ? "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20"
          : "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20"
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
        aria-expanded={expanded}
      >
        <AlertTriangle
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            anyCritical
              ? "text-rose-600 dark:text-rose-400"
              : "text-amber-600 dark:text-amber-400"
          )}
        />
        <span
          className={cn(
            "flex-1",
            anyCritical
              ? "text-rose-800 dark:text-rose-200"
              : "text-amber-800 dark:text-amber-200"
          )}
        >
          <span className="font-semibold tabular-nums">{totalSlots}</span>{" "}
          créneau{totalSlots > 1 ? "x" : ""} en sous-effectif cette semaine
          <span className="ml-1 opacity-70">
            · {days.length} jour{days.length > 1 ? "s" : ""}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-black/5 px-3 py-2 dark:border-white/10">
          {days.map((d) => (
            <div key={d.date} className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onJump(d.dayIndex)}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80 hover:bg-black/5 dark:hover:bg-white/10"
                title={`Aller à ${weekDayLabels[d.dayIndex]}`}
              >
                {weekDayLabels[d.dayIndex]}
              </button>
              {d.holes.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onJump(d.dayIndex)}
                  title={`${weekDayLabels[d.dayIndex]} ${h.from}–${h.to} · effectif ${h.minCount}/${minStaff} — clique pour y aller`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset transition-colors",
                    h.level === "critical"
                      ? "bg-rose-100 text-rose-800 ring-rose-200 hover:bg-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900/60"
                      : "bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900/60"
                  )}
                >
                  {h.from}–{h.to}
                  <span className="opacity-70">
                    {h.minCount}/{minStaff}
                  </span>
                </button>
              ))}
            </div>
          ))}
          <p className="pt-0.5 text-[10.5px] text-muted-foreground/70">
            Effectif comptoir (pharmaciens + préparateurs + étudiants) sous le
            seuil de {minStaff}. Clique une plage pour y aller.
          </p>
        </div>
      )}
    </div>
  );
}