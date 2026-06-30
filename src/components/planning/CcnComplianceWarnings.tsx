"use client";

import { useState } from "react";
import { AlertTriangle, ShieldAlert, ChevronDown } from "lucide-react";
import type { CcnViolation } from "@/lib/ccn-compliance";
import { cn } from "@/lib/utils";

/**
 * Bandeau d'alerte « planning non conforme » (Convention collective Pharmacie
 * d'officine). Affiche les manquements légaux détectés avec leur motif :
 *  - rouge : manquements illégaux (repos quotidien, durées max…),
 *  - orange : points à vérifier (amplitude, coupures, repos hebdo…).
 * Ne s'affiche que s'il y a au moins un manquement (sinon : planning conforme).
 */
export function CcnComplianceWarnings({
  violations,
}: {
  violations: CcnViolation[];
}) {
  const [open, setOpen] = useState(false);
  if (violations.length === 0) return null;

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  const hasErrors = errors.length > 0;

  // Aperçu (3 premiers) quand replié.
  const ordered = [...errors, ...warnings];
  const shown = open ? ordered : ordered.slice(0, 3);
  const rest = ordered.length - shown.length;

  return (
    <div
      className={cn(
        "no-print rounded-2xl border px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        hasErrors
          ? "border-rose-300/70 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/25"
          : "border-amber-300/70 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/25"
      )}
    >
      <div className="flex items-center gap-2">
        {hasErrors ? (
          <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <p
          className={cn(
            "text-[13px] font-semibold tracking-tight flex-1",
            hasErrors
              ? "text-rose-900 dark:text-rose-200"
              : "text-amber-900 dark:text-amber-200"
          )}
        >
          {hasErrors
            ? `Planning non conforme — ${errors.length} manquement${errors.length > 1 ? "s" : ""}`
            : `Planning à vérifier — ${warnings.length} point${warnings.length > 1 ? "s" : ""}`}
          {hasErrors && warnings.length > 0 && (
            <span className="font-normal opacity-70">
              {" "}
              · {warnings.length} à vérifier
            </span>
          )}
        </p>
        <span
          className={cn(
            "shrink-0 text-[10px] uppercase tracking-[0.06em] font-semibold rounded-full px-2 py-0.5",
            hasErrors
              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
          )}
          title="Convention collective Pharmacie d'officine"
        >
          CCN
        </span>
      </div>

      <ul className="mt-2 space-y-1">
        {shown.map((v, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px]">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0",
                v.severity === "error" ? "bg-rose-500" : "bg-amber-500"
              )}
              aria-hidden
            />
            <span className="text-foreground/85 leading-snug">{v.message}</span>
          </li>
        ))}
      </ul>

      {rest > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-foreground/70 hover:text-foreground"
        >
          Voir {rest} de plus
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
      {open && ordered.length > 3 && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-foreground/70 hover:text-foreground"
        >
          Réduire
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
        </button>
      )}
    </div>
  );
}
