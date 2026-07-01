"use client";

import { CalendarCheck, GraduationCap, Stethoscope, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Panneau « Impact des absences sur la paie » — pont visible Absences ↔ Paie.
 *
 * Les absences saisies dans le planning (Congé / Formation / Maladie / Absent)
 * sont déjà consommées par `payroll-calc` : chaque ligne de paie porte le détail
 * des heures d'absence ventilées + le taux horaire effectif. Ce composant rend
 * ce détail LISIBLE pour le titulaire : qui a été absent ce mois-ci, sous quel
 * régime, et ce que ça change sur la fiche de paie (rémunéré / indemnisé /
 * retenue chiffrée).
 *
 * Volontairement découplé : il ne recalcule rien de sensible, il présente les
 * champs déjà produits par `computePayrollLine`. La retenue affichée pour les
 * absences non rémunérées reprend la même base que le calcul (heures × taux
 * horaire effectif).
 */

/** Sous-ensemble structurel de PayrollLine dont ce panneau a besoin. */
export type AbsenceImpactLine = {
  employeeName: string;
  /** Taux horaire effectif (saisi en horaire, implicite en mensuel). */
  effectiveHourlyRate: number | null;
  paidLeaveHours: number;
  trainingHours: number;
  sickHoursEmployerPaid: number;
  sickHoursWaitingPeriod: number;
  sickHoursCpam: number;
  unpaidAbsenceHours: number;
};

const fmtEur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const fmtH = (n: number) => `${n.toFixed(1)} h`;

/** Pastille catégorie d'absence, colorée selon le traitement de paie. */
function Chip({
  tone,
  icon: Icon,
  label,
  hours,
  extra,
  title,
}: {
  tone: "paid" | "indemnified" | "unpaid";
  icon: typeof CalendarCheck;
  label: string;
  hours: number;
  extra?: string;
  title?: string;
}) {
  const cls = {
    paid: "border-emerald-200/70 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200",
    indemnified:
      "border-amber-200/70 bg-amber-50/70 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200",
    unpaid:
      "border-rose-200/70 bg-rose-50/70 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] font-medium",
        cls
      )}
      title={title}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
      <span className="font-mono tabular-nums opacity-80">{fmtH(hours)}</span>
      {extra && <span className="font-mono tabular-nums font-semibold">{extra}</span>}
    </span>
  );
}

export function AbsenceImpactPanel({ lines }: { lines: AbsenceImpactLine[] }) {
  const rows = lines
    .map((l) => {
      const sickTotal =
        l.sickHoursEmployerPaid + l.sickHoursWaitingPeriod + l.sickHoursCpam;
      const deduction = l.unpaidAbsenceHours * (l.effectiveHourlyRate ?? 0);
      const total =
        l.paidLeaveHours + l.trainingHours + sickTotal + l.unpaidAbsenceHours;
      return { ...l, sickTotal, deduction, total };
    })
    .filter((r) => r.total > 0);

  // Rien à montrer si aucune absence sur le mois → le composant s'efface.
  if (rows.length === 0) return null;

  const totalDeduction = rows.reduce((s, r) => s + r.deduction, 0);
  const totalPaidLeave = rows.reduce(
    (s, r) => s + r.paidLeaveHours + r.trainingHours,
    0
  );
  const totalSick = rows.reduce((s, r) => s + r.sickTotal, 0);

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarX className="h-4 w-4 text-violet-600" />
          <h2 className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
            Impact des absences sur la paie
          </h2>
        </div>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Les absences posées au planning se répercutent automatiquement sur les
          fiches de paie ci-dessus. Détail par salarié pour ce mois :
        </p>
        {/* Récap équipe */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50/70 px-2.5 py-1 text-[11.5px] font-medium text-rose-800 dark:bg-rose-950/20 dark:text-rose-200">
            Retenues (absences non rémunérées)
            <span className="font-mono font-semibold tabular-nums">
              −{fmtEur(totalDeduction)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50/70 px-2.5 py-1 text-[11.5px] font-medium text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200">
            Congés + formation (rémunérés)
            <span className="font-mono font-semibold tabular-nums">
              {fmtH(totalPaidLeave)}
            </span>
          </span>
          {totalSick > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50/70 px-2.5 py-1 text-[11.5px] font-medium text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              Maladie (indemnisée)
              <span className="font-mono font-semibold tabular-nums">
                {fmtH(totalSick)}
              </span>
            </span>
          )}
        </div>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li
            key={r.employeeName}
            className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-[12.5px] font-medium text-zinc-900 dark:text-zinc-100">
              {r.employeeName}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {r.paidLeaveHours > 0 && (
                <Chip
                  tone="paid"
                  icon={CalendarCheck}
                  label="Congé payé"
                  hours={r.paidLeaveHours}
                  title="Rémunéré — maintien de salaire, décompté du solde de congés payés"
                />
              )}
              {r.trainingHours > 0 && (
                <Chip
                  tone="paid"
                  icon={GraduationCap}
                  label="Formation"
                  hours={r.trainingHours}
                  title="Rémunéré — temps de travail assimilé"
                />
              )}
              {r.sickTotal > 0 && (
                <Chip
                  tone="indemnified"
                  icon={Stethoscope}
                  label="Maladie"
                  hours={r.sickTotal}
                  title={`Indemnisé — employeur ${fmtH(
                    r.sickHoursEmployerPaid
                  )} · carence 3j non payés ${fmtH(
                    r.sickHoursWaitingPeriod
                  )} · CPAM (info) ${fmtH(r.sickHoursCpam)}`}
                />
              )}
              {r.unpaidAbsenceHours > 0 && (
                <Chip
                  tone="unpaid"
                  icon={CalendarX}
                  label="Absent"
                  hours={r.unpaidAbsenceHours}
                  extra={`−${fmtEur(r.deduction)}`}
                  title="Non rémunéré — retenue sur salaire (heures × taux horaire effectif)"
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-4 py-2.5 text-[11px] italic text-muted-foreground">
        Congé payé et formation sont maintenus (100 % employeur) ; la maladie est
        indemnisée (IJSS + maintien selon ancienneté, carence légale 3 j) ; une
        absence non justifiée génère une retenue = heures × taux horaire. Ces
        montants sont déjà intégrés au brut de chaque salarié.
      </p>
    </section>
  );
}