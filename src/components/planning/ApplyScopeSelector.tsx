"use client";

import { Calendar, Repeat, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Représente la portée d'application d'une modification :
 *  - "1" / "4" / "8" / "12" : nombre de semaines consécutives à partir de la date
 *  - "year-pattern"         : toutes les semaines de même type (S1 ou S2)
 *                             jusqu'à la fin de l'année courante (cap : 26 sem.)
 */
export type ApplyScope = "1" | "4" | "8" | "12" | "year-pattern";

const NUMERIC_OPTIONS: Array<{ value: ApplyScope; label: string; sub: string }> = [
  { value: "1", label: "Cette semaine", sub: "uniquement" },
  { value: "4", label: "+4 sem.", sub: "≈ 1 mois" },
  { value: "8", label: "+8 sem.", sub: "≈ 2 mois" },
  { value: "12", label: "+12 sem.", sub: "≈ 3 mois" },
];

/**
 * Segmented control "Appliquer à" — utilisé dans le TaskSelector et le
 * BulkTaskSelector pour répliquer la modification sur plusieurs semaines.
 *
 * Par défaut on propose 4 semaines : le planning étant souvent récurrent,
 * c'est le compromis le plus utile.
 *
 * Quand un type de semaine (S1/S2) est connu, on propose en plus
 * "Toutes les S{1|2} de l'année" pour répercuter sur toutes les semaines
 * de même rythme jusqu'à fin décembre.
 */
export function ApplyScopeSelector({
  value,
  onChange,
  disabled,
  weekKind,
}: {
  value: ApplyScope;
  onChange: (v: ApplyScope) => void;
  disabled?: boolean;
  /** "S1" ou "S2" — affiche l'option "Toutes les S{kind} de l'année" */
  weekKind?: "S1" | "S2";
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <Repeat className="h-3 w-3" />
        Appliquer à
      </div>

      <div
        role="radiogroup"
        aria-label="Période d'application"
        className={cn(
          "flex flex-wrap items-stretch gap-1.5",
          disabled && "opacity-60"
        )}
      >
        {/* Options numériques (segmented control) */}
        <div className="inline-flex items-stretch gap-0.5 rounded-xl bg-zinc-100/70 p-1 ring-1 ring-inset ring-zinc-200/70">
          {NUMERIC_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange(opt.value)}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg px-3 py-1.5 transition-all duration-150",
                  active
                    ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/60"
                    : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                <span className="inline-flex items-center gap-1 text-[12px] font-medium leading-tight">
                  {opt.value === "1" ? <Calendar className="h-3 w-3" /> : null}
                  {opt.label}
                </span>
                <span
                  className={cn(
                    "text-[10px] leading-tight",
                    active ? "text-zinc-500" : "text-zinc-400"
                  )}
                >
                  {opt.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Option spéciale : toutes les S1 ou S2 de l'année */}
        {weekKind && (
          <button
            type="button"
            role="radio"
            aria-checked={value === "year-pattern"}
            disabled={disabled}
            onClick={() => onChange("year-pattern")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-medium transition-all duration-150 ring-1 ring-inset",
              value === "year-pattern"
                ? "bg-violet-50 text-violet-700 ring-violet-200 shadow-sm"
                : "bg-white text-zinc-600 ring-zinc-200/70 hover:text-zinc-900 hover:ring-zinc-300"
            )}
          >
            <Sparkles className="h-3 w-3" />
            <span className="flex flex-col items-start leading-tight">
              <span>Toutes les {weekKind} de l&apos;année</span>
              <span
                className={cn(
                  "text-[10px]",
                  value === "year-pattern" ? "text-violet-600/80" : "text-zinc-400"
                )}
              >
                jusqu&apos;à fin décembre
              </span>
            </span>
          </button>
        )}
      </div>

      <p className="mt-1.5 text-[11px] text-zinc-500">
        {scopeDescription(value, weekKind)}
      </p>
    </div>
  );
}

function scopeDescription(scope: ApplyScope, weekKind?: "S1" | "S2"): string {
  switch (scope) {
    case "1":
      return "La modification ne touche que cette semaine.";
    case "year-pattern":
      return weekKind
        ? `La modification est répliquée sur toutes les semaines ${weekKind} jusqu'à la fin de l'année.`
        : "La modification est répliquée sur toutes les semaines de même type jusqu'à fin d'année.";
    default:
      return `La modification est répliquée sur ${scope} semaines à partir de cette date.`;
  }
}
