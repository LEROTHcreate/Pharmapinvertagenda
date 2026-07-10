"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type BarSeries = {
  key: string;
  label: string;
  /** Couleur du mark (hex) — identité de la série, valable en clair/sombre. */
  color: string;
};

export type BarDatum = {
  key: string;
  label: string;
  /** Valeur par série (clé = BarSeries.key). Empilées dans l'ordre de `series`. */
  values: Record<string, number>;
};

/**
 * Graphique de tendance à barres (simple ou empilé), soigné et interactif :
 *  · gridlines horizontales discrètes + ligne de base ;
 *  · barres à extrémités arrondies (4px), 2px de respiration entre segments ;
 *  · survol d'un mois → colonne mise en avant + tooltip détaillé.
 * Purement présentationnel — les couleurs et le format sont fournis par l'appelant.
 */
export function BarTrend({
  data,
  series,
  height = 150,
  format = (n) => n.toLocaleString("fr-FR"),
  topLabel,
  yTicks = 3,
  className,
}: {
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  format?: (n: number) => string;
  /** Étiquette au sommet de chaque barre (ex. total). */
  topLabel?: (d: BarDatum, total: number) => string;
  yTicks?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const totals = data.map((d) =>
    series.reduce((s, ser) => s + (d.values[ser.key] ?? 0), 0)
  );
  const max = Math.max(1, ...totals);
  // Repères horizontaux (gridlines) à des fractions régulières du max.
  const ticks = Array.from({ length: yTicks }, (_, i) => (i + 1) / (yTicks + 1));

  return (
    <div className={cn("select-none", className)}>
      {/* Zone graphique */}
      <div className="relative" style={{ height }}>
        {/* Gridlines discrètes */}
        {ticks.map((t) => (
          <div
            key={t}
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-border/50"
            style={{ bottom: `${t * 100}%` }}
          />
        ))}
        {/* Ligne de base */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 border-t border-border"
        />

        {/* Colonnes */}
        <div className="absolute inset-0 flex items-end justify-between gap-1.5">
          {data.map((d, i) => {
            const total = totals[i];
            const active = hover === i;
            return (
              <div
                key={d.key}
                className="group relative flex h-full flex-1 flex-col justify-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              >
                {/* Étiquette sommet (optionnelle) */}
                {topLabel && (
                  <span
                    className={cn(
                      "mb-1 text-center text-[9.5px] font-medium tabular-nums transition-colors",
                      active ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {topLabel(d, total)}
                  </span>
                )}
                {/* Pile de segments (du bas vers le haut) */}
                <div className="mx-auto flex w-full max-w-[42px] flex-col-reverse gap-[2px]">
                  {series.map((ser) => {
                    const v = d.values[ser.key] ?? 0;
                    if (v <= 0) return null;
                    const h = Math.max(2, (v / max) * (height - (topLabel ? 18 : 4)));
                    return (
                      <div
                        key={ser.key}
                        className={cn(
                          "rounded-[4px] transition-[opacity,transform] duration-150",
                          hover != null && !active ? "opacity-40" : "opacity-100"
                        )}
                        style={{ height: h, backgroundColor: ser.color }}
                      />
                    );
                  })}
                </div>

                {/* Tooltip */}
                {active && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-left shadow-lg">
                    <p className="mb-0.5 text-[11px] font-semibold capitalize text-foreground">
                      {d.label}
                    </p>
                    {series.length > 1 &&
                      series.map((ser) => (
                        <p
                          key={ser.key}
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                        >
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-sm"
                            style={{ backgroundColor: ser.color }}
                          />
                          {ser.label} :{" "}
                          <span className="ml-auto pl-2 font-mono tabular-nums text-foreground">
                            {format(d.values[ser.key] ?? 0)}
                          </span>
                        </p>
                      ))}
                    <p
                      className={cn(
                        "flex items-center gap-1.5 text-[11px]",
                        series.length > 1
                          ? "mt-0.5 border-t border-border/60 pt-0.5 font-semibold text-foreground"
                          : "text-foreground"
                      )}
                    >
                      {series.length > 1 ? "Total" : series[0].label} :{" "}
                      <span className="ml-auto pl-2 font-mono font-semibold tabular-nums">
                        {format(total)}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Étiquettes de mois */}
      <div className="mt-1.5 flex items-end justify-between gap-1.5">
        {data.map((d, i) => (
          <span
            key={d.key}
            className={cn(
              "flex-1 text-center text-[10.5px] capitalize transition-colors",
              hover === i ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {d.label}
          </span>
        ))}
      </div>

      {/* Légende (≥ 2 séries) */}
      {series.length > 1 && (
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {series.map((ser) => (
            <span
              key={ser.key}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: ser.color }}
              />
              {ser.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
