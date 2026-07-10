"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type LinePoint = { key: string; label: string; value: number };

/**
 * Courbe de tendance interactive : aire + ligne, repère horizontal optionnel,
 * et au survol un crosshair vertical + point mis en avant + tooltip. Le tracé
 * est en coordonnées SVG fixes (responsive via viewBox) ; le survol calcule
 * l'index à partir de la position relative de la souris.
 */
export function LineTrend({
  data,
  color = "#7c3aed",
  height = 96,
  format = (n) => n.toLocaleString("fr-FR"),
  reference,
  className,
}: {
  data: LinePoint[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
  /** Ligne de repère horizontale (ex. capacité contractuelle). */
  reference?: { value: number; label: string };
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const W = 600;
  const H = height;
  const pad = 6;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value), reference?.value ?? 0);
  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);

  const linePts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const areaPts = `${x(0)},${H - pad} ${linePts} ${x(n - 1)},${H - pad}`;

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    setHover(idx);
  };

  const active = hover != null ? data[hover] : null;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={wrapRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: H }}
          role="img"
          aria-label="Courbe de tendance"
        >
          {/* Repère horizontal (optionnel) */}
          {reference && reference.value <= max && (
            <line
              x1={0}
              y1={y(reference.value)}
              x2={W}
              y2={y(reference.value)}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polygon points={areaPts} fill={color} fillOpacity={0.1} />
          <polyline
            points={linePts}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* Crosshair + point actif */}
          {hover != null && (
            <>
              <line
                x1={x(hover)}
                y1={0}
                x2={x(hover)}
                y2={H}
                stroke={color}
                strokeOpacity={0.35}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(hover)}
                cy={y(data[hover].value)}
                r={3.5}
                fill={color}
                stroke="#fff"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      </div>

      {/* Tooltip */}
      {active && (
        <div
          className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-lg"
          style={{
            left: `${n <= 1 ? 50 : (hover! / (n - 1)) * 100}%`,
          }}
        >
          <p className="text-[11px] font-semibold text-foreground">
            {format(active.value)}
          </p>
          <p className="text-[10.5px] text-muted-foreground">{active.label}</p>
        </div>
      )}

      {/* Bornes + repère */}
      <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{data[0]?.label}</span>
        {reference && (
          <span className="text-muted-foreground/80">
            {reference.label} {format(reference.value)}
          </span>
        )}
        <span>{data[n - 1]?.label}</span>
      </div>
    </div>
  );
}
