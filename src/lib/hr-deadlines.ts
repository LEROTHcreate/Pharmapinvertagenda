/**
 * Calcul des échéances RH à venir (rappels pour le titulaire) :
 *  - Fin de CDD / stage / apprentissage / intérim
 *  - Fin de période d'essai
 *  - Visite médicale du travail (périodicité indicative 24 mois)
 *  - Entretien professionnel (obligation légale : tous les 2 ans)
 *  - DPC pharmacien (cycle triennal : 36 mois)
 *
 * Pure fonction (testable, sans I/O). Les périodicités sont indicatives et
 * peuvent varier selon la situation ; elles servent de rappel, pas de règle
 * juridique opposable.
 */

import type { ContractType } from "@prisma/client";

export type DeadlineKind =
  | "cdd_end"
  | "trial_end"
  | "medical_visit"
  | "professional_interview"
  | "dpc";

export type DeadlineLevel = "overdue" | "soon" | "upcoming";

export type HrDeadline = {
  employeeId: string;
  employeeName: string;
  kind: DeadlineKind;
  label: string;
  /** Date d'échéance (ISO YYYY-MM-DD). */
  dueDate: string;
  /** Jours avant l'échéance (négatif = dépassé). */
  daysUntil: number;
  level: DeadlineLevel;
};

export type EmployeeDeadlineInput = {
  id: string;
  firstName: string;
  lastName: string;
  contractType: ContractType;
  contractEndDate: Date | null;
  trialEndDate: Date | null;
  lastMedicalVisitDate: Date | null;
  lastProfessionalInterviewDate: Date | null;
  dpcLastDate: Date | null;
};

/** Périodicité (mois) des échéances récurrentes. */
const PERIOD_MONTHS = {
  medical_visit: 24,
  professional_interview: 24,
  dpc: 36,
} as const;

/** Fenêtre d'anticipation (jours) à partir de laquelle on affiche le rappel. */
const WINDOW_DAYS = {
  cdd_end: 45,
  trial_end: 14,
  medical_visit: 60,
  professional_interview: 60,
  dpc: 90,
} as const;

/** Au-delà de ce dépassement (jours), on cesse d'afficher les échéances
 *  one-shot (CDD/essai) pour ne pas polluer indéfiniment. */
const ONESHOT_STALE_DAYS = 14;

/** Seuil "soon" (warning) — en deçà, l'échéance est imminente. */
const SOON_DAYS = 14;

const LABELS: Record<DeadlineKind, string> = {
  cdd_end: "Fin de contrat",
  trial_end: "Fin de période d'essai",
  medical_visit: "Visite médicale",
  professional_interview: "Entretien professionnel",
  dpc: "DPC (pharmacien)",
};

function isoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function dateOnlyUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addMonthsUtc(d: Date, months: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())
  );
}
function daysBetween(fromIso: string, due: Date): number {
  return Math.round((dateOnlyUtc(due).getTime() - parseUtc(fromIso).getTime()) / 86400000);
}
function levelFor(daysUntil: number): DeadlineLevel {
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= SOON_DAYS) return "soon";
  return "upcoming";
}

const FIXED_TERM: ContractType[] = ["CDD", "STAGE", "APPRENTISSAGE", "INTERIM"];

/** Échéances à venir pour un employé, à la date `fromIso` (YYYY-MM-DD). */
export function deadlinesForEmployee(
  emp: EmployeeDeadlineInput,
  fromIso: string
): HrDeadline[] {
  const name = `${emp.firstName} ${emp.lastName}`.trim();
  const out: HrDeadline[] = [];

  const pushOneShot = (kind: "cdd_end" | "trial_end", date: Date | null) => {
    if (!date) return;
    const days = daysBetween(fromIso, date);
    if (days > WINDOW_DAYS[kind]) return; // trop loin
    if (days < -ONESHOT_STALE_DAYS) return; // dépassé depuis trop longtemps
    out.push({
      employeeId: emp.id,
      employeeName: name,
      kind,
      label: LABELS[kind],
      dueDate: isoUtc(dateOnlyUtc(date)),
      daysUntil: days,
      level: levelFor(days),
    });
  };

  // Fin de contrat : uniquement pour les contrats à durée déterminée.
  if (FIXED_TERM.includes(emp.contractType)) {
    pushOneShot("cdd_end", emp.contractEndDate);
  }
  pushOneShot("trial_end", emp.trialEndDate);

  const pushPeriodic = (
    kind: "medical_visit" | "professional_interview" | "dpc",
    last: Date | null
  ) => {
    if (!last) return;
    const due = addMonthsUtc(dateOnlyUtc(last), PERIOD_MONTHS[kind]);
    const days = daysBetween(fromIso, due);
    if (days > WINDOW_DAYS[kind]) return; // pas encore dans la fenêtre de rappel
    out.push({
      employeeId: emp.id,
      employeeName: name,
      kind,
      label: LABELS[kind],
      dueDate: isoUtc(due),
      daysUntil: days,
      level: levelFor(days),
    });
  };

  pushPeriodic("medical_visit", emp.lastMedicalVisitDate);
  pushPeriodic("professional_interview", emp.lastProfessionalInterviewDate);
  pushPeriodic("dpc", emp.dpcLastDate);

  return out;
}

/** Toutes les échéances de l'officine, triées par urgence (date croissante). */
export function upcomingDeadlines(
  employees: EmployeeDeadlineInput[],
  fromIso: string
): HrDeadline[] {
  return employees
    .flatMap((e) => deadlinesForEmployee(e, fromIso))
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
