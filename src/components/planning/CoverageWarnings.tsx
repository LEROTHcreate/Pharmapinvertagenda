"use client";

import { AlertTriangle, Truck } from "lucide-react";
import type { CoverageWarning } from "@/lib/coverage-analysis";

/**
 * Bandeau compact qui liste les manquements aux règles de couverture
 * (pharmacien, préparateurs, absence du livreur). N'affiche rien
 * s'il n'y a pas de warning.
 */
export function CoverageWarnings({
  warnings,
}: {
  warnings: CoverageWarning[];
}) {
  if (warnings.length === 0) return null;

  // Groupe par type pour un rendu plus lisible
  const byKind = {
    "no-pharmacist": [] as Extract<CoverageWarning, { kind: "no-pharmacist" }>[],
    "few-preparers": [] as Extract<CoverageWarning, { kind: "few-preparers" }>[],
    "livreur-absent": [] as Extract<CoverageWarning, { kind: "livreur-absent" }>[],
  };
  warnings.forEach((w) => {
    if (w.kind === "no-pharmacist") byKind["no-pharmacist"].push(w);
    else if (w.kind === "few-preparers") byKind["few-preparers"].push(w);
    else byKind["livreur-absent"].push(w);
  });

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-[10.5px] uppercase tracking-[0.08em] font-medium text-muted-foreground/70">
        Couverture
      </span>

      {byKind["no-pharmacist"].map((w, i) => (
        <Pill key={`np-${i}`} tone="red" icon={<AlertTriangle className="h-3 w-3" />}>
          Pas de pharmacien {formatDayShort(w.date)} ·{" "}
          <span className="opacity-80">{w.slots.join(", ")}</span>
        </Pill>
      ))}

      {byKind["few-preparers"].map((w, i) => (
        <Pill
          key={`fp-${i}`}
          tone="amber"
          icon={<AlertTriangle className="h-3 w-3" />}
        >
          {w.minCount === 0 ? "Aucun" : `${w.minCount}`} préparateur
          {w.minCount > 1 ? "s" : ""} {formatDayShort(w.date)} ·{" "}
          <span className="opacity-80">{w.slots.join(", ")}</span>
        </Pill>
      ))}

      {byKind["livreur-absent"].map((w, i) => (
        <Pill key={`la-${i}`} tone="indigo" icon={<Truck className="h-3 w-3" />}>
          {w.employeeName} absent {formatDayShort(w.date)} —{" "}
          <span className="opacity-80">titulaires sur livraisons</span>
        </Pill>
      ))}
    </div>
  );
}

function Pill({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: "red" | "amber" | "indigo";
  icon?: React.ReactNode;
}) {
  const styles = {
    red: "bg-red-50 text-red-800 ring-red-100",
    amber: "bg-amber-50 text-amber-800 ring-amber-100",
    indigo: "bg-indigo-50 text-indigo-800 ring-indigo-100",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ring-1 ring-inset tracking-tight ${styles}`}
    >
      {icon}
      <span className="font-medium">{children}</span>
    </span>
  );
}

function formatDayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
