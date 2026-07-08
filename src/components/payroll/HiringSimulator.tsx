"use client";

import { useMemo, useState } from "react";
import { UserPlus, AlertTriangle, Check } from "lucide-react";
import type { EmployeeStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/types";
import { EMPLOYEE_STATUSES } from "@/validators/employee";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { smicHourlyAt } from "@/lib/payroll-reference";
import { cn } from "@/lib/utils";

function eur(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

/**
 * Simulateur d'embauche — « si j'embauche un préparateur à 30 h » : coût
 * employeur mensuel/annuel estimé (brut × taux patronal), impact sur la
 * projection annuelle vs budget, et gain de couverture comptoir.
 * Estimation volontairement simple (taux patronal moyen) — pas un devis paie.
 */
export function HiringSimulator({
  month,
  employerRate,
  currentAnnualProjection,
  annualBudget,
}: {
  month: string;
  employerRate: number;
  /** Projection annuelle actuelle (coût du mois × 12), ou null. */
  currentAnnualProjection: number | null;
  annualBudget: number | null;
}) {
  const [status, setStatus] = useState<EmployeeStatus>("PREPARATEUR");
  const [hours, setHours] = useState("30");
  const smic = smicHourlyAt(month);
  const [rate, setRate] = useState(String(smic));

  const sim = useMemo(() => {
    const h = Math.max(0, Number(hours.replace(",", ".")) || 0);
    const r = Math.max(0, Number(rate.replace(",", ".")) || 0);
    const monthlyGross = r * h * (52 / 12);
    const monthlyCost = monthlyGross * (1 + employerRate);
    const annualCost = monthlyCost * 12;
    const addsComptoir = isTaskAllowed(status, "COMPTOIR");
    return { h, monthlyGross, monthlyCost, annualCost, addsComptoir };
  }, [hours, rate, employerRate, status]);

  const newProjection =
    currentAnnualProjection != null ? currentAnnualProjection + sim.annualCost : null;
  const over =
    annualBudget != null && newProjection != null && newProjection > annualBudget;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
          <UserPlus className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight">
            Simuler une embauche
          </h2>
          <p className="text-[11.5px] text-muted-foreground">
            Coût estimé et impact sur la couverture comptoir.
          </p>
        </div>
      </div>

      {/* Entrées */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Statut
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
            className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-violet-400"
          >
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Heures / semaine
          </span>
          <input
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-violet-400"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Taux horaire brut (€)
          </span>
          <input
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-violet-400"
          />
        </label>
      </div>

      {/* Résultats */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Brut mensuel" value={eur(sim.monthlyGross)} />
        <Stat label="Coût employeur / mois" value={eur(sim.monthlyCost)} strong />
        <Stat label="Coût employeur / an" value={eur(sim.annualCost)} strong />
        <Stat
          label="Couverture comptoir"
          value={sim.addsComptoir ? `+${sim.h} h/sem` : "aucune"}
          tone={sim.addsComptoir ? "emerald" : "muted"}
        />
      </div>

      {/* Impact budget */}
      {annualBudget != null && newProjection != null && (
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px]",
            over
              ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100"
              : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
          )}
        >
          {over ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <Check className="h-4 w-4 shrink-0" />
          )}
          <span>
            Nouvelle projection annuelle :{" "}
            <strong className="tabular-nums">{eur(newProjection)}</strong> ·{" "}
            {over
              ? `dépasse le budget de ${eur(newProjection - annualBudget)}`
              : `reste sous le budget (${eur(annualBudget - newProjection)} de marge)`}
          </span>
        </div>
      )}

      <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
        Estimation indicative (taux patronal moyen de l&apos;officine, brut ×
        cotisations). Le coût réel dépend du statut, des exonérations et de la
        convention. Défaut : SMIC horaire.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
  tone = "default",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "default" | "emerald" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5">
      <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "tabular-nums",
          strong ? "text-[15px] font-bold" : "text-[13px] font-semibold",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
