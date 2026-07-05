import { prisma } from "@/lib/prisma";
import { ScheduleType } from "@prisma/client";
import { SLOT_HOURS } from "@/types";
import type { AbsenceCode, EmployeeStatus } from "@prisma/client";

// Absences "rémunérées" qui comptent comme temps de contrat rempli (congé payé,
// maladie indemnisée, formation sur le temps de travail). ABSENT (non précisé)
// ne compte pas. Aligné sur dailyTaskHours() de planning-utils.
const PAID_ABSENCE_CODES: ReadonlySet<AbsenceCode> = new Set([
  "CONGE",
  "MALADIE",
  "FORMATION_ABS",
]);

export type StatsPeriod = "week" | "month" | "semester" | "all";

export type EmployeeStat = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: number;
  displayColor: string;
  // Heures planifiées (TASK uniquement) sur la période
  taskHours: number;
  // Heures d'absence sur la période
  absenceHours: number;
  // Heures supplémentaires cumulées : pour chaque semaine, max(0, hebdoPlanifiée - contrat)
  overtimeHours: number;
  // Solde HS-Abs (à la française) : HS cumulées - absences cumulées
  hsAbsBalance: number;
  // Nombre de semaines avec activité (TASK ou ABSENCE)
  weekCount: number;
  // Moyenne hebdo EFFECTIVE (travail + absences rémunérées) sur les semaines
  // avec activité — base de comparaison au contrat (sur/sous-effectif).
  avgWeeklyHours: number;
  // Série hebdomadaire (pour le mini-graphique) — ordre chronologique
  weekly: Array<{ weekStart: string; taskHours: number }>;
};

export type PeriodInfo = {
  start: Date;
  end: Date; // exclusive
  label: string;
};

/** Période courante en fonction du sélecteur. `now` = date de référence. */
export function getPeriodRange(period: StatsPeriod, now = new Date()): PeriodInfo {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  if (period === "week") {
    // Lundi de la semaine courante (réutilise le même calcul UTC que le
    // bucketing hebdo — plus de logique start-of-week dupliquée dans ce fichier).
    const monday = isoWeekStartUTC(now);
    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    const sat = new Date(monday);
    sat.setUTCDate(monday.getUTCDate() + 5);
    return {
      start: monday,
      end: nextMonday,
      label: `Semaine du ${monday.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      })} au ${sat.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
      })}`,
    };
  }
  if (period === "month") {
    return {
      start: new Date(Date.UTC(year, month, 1)),
      end: new Date(Date.UTC(year, month + 1, 1)),
      label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    };
  }
  if (period === "semester") {
    if (month < 6) {
      return {
        start: new Date(Date.UTC(year, 0, 1)),
        end: new Date(Date.UTC(year, 6, 1)),
        label: `S1 ${year}`,
      };
    }
    return {
      start: new Date(Date.UTC(year, 6, 1)),
      end: new Date(Date.UTC(year + 1, 0, 1)),
      label: `S2 ${year}`,
    };
  }
  // "all" → bornes très larges, on shortcut côté requête en omettant le filtre
  return {
    start: new Date(Date.UTC(2000, 0, 1)),
    end: new Date(Date.UTC(2100, 0, 1)),
    label: "Tout l'historique",
  };
}

/** Lundi de la semaine ISO en UTC (start-of-week). */
function isoWeekStartUTC(d: Date): Date {
  const day = d.getUTCDay(); // 0=dim, 1=lun…6=sam
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + diff);
  return start;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Profil minimal d'employé nécessaire au calcul des stats. */
type EmployeeBase = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: number;
  displayColor: string;
  /** Titulaire : compter ses heures sup ? (false = dividendes/salaire fixe). */
  titulaireCountsOvertime: boolean;
};

/** Totaux agrégés équipe sur une période (sert à la comparaison). */
export type PeriodTotals = {
  task: number;
  overtime: number;
  absence: number;
  overContract: number;
  underContract: number;
};

/** Construit les stats par collaborateur à partir d'un lot d'entrées. (pur) */
export function buildEmployeeStats(
  employees: EmployeeBase[],
  entries: Array<{
    employeeId: string;
    type: ScheduleType;
    date: Date;
    absenceCode: AbsenceCode | null;
  }>
): EmployeeStat[] {
  // Bucketing : { employeeId → { weekStart → { task, absence, paidAbsence } } }
  // paidAbsence = créneaux d'absence rémunérée (comptent vers le contrat).
  const byEmp = new Map<
    string,
    Map<string, { task: number; absence: number; paidAbsence: number }>
  >();
  for (const e of entries) {
    const weekKey = isoDate(isoWeekStartUTC(e.date));
    let weeks = byEmp.get(e.employeeId);
    if (!weeks) {
      weeks = new Map();
      byEmp.set(e.employeeId, weeks);
    }
    let bucket = weeks.get(weekKey);
    if (!bucket) {
      bucket = { task: 0, absence: 0, paidAbsence: 0 };
      weeks.set(weekKey, bucket);
    }
    if (e.type === ScheduleType.TASK) {
      bucket.task += 1;
    } else if (e.type === ScheduleType.ABSENCE) {
      bucket.absence += 1;
      if (e.absenceCode && PAID_ABSENCE_CODES.has(e.absenceCode)) {
        bucket.paidAbsence += 1;
      }
    }
  }

  return employees.map((emp) => {
    const weeks = byEmp.get(emp.id) ?? new Map();
    const sortedKeys = Array.from(weeks.keys()).sort();
    let totalTaskHours = 0;
    let totalAbsenceHours = 0;
    let totalOvertimeHours = 0;
    // Heures "effectives" = travail + absences rémunérées → base de comparaison
    // au contrat (un collaborateur en congé payé n'est PAS en sous-effectif).
    let totalEffectiveHours = 0;
    const weekly: Array<{ weekStart: string; taskHours: number }> = [];
    for (const key of sortedKeys) {
      const b = weeks.get(key)!;
      const taskH = b.task * SLOT_HOURS;
      const absH = b.absence * SLOT_HOURS;
      totalTaskHours += taskH;
      totalAbsenceHours += absH;
      // HS : uniquement sur le travail réel (les absences ne génèrent pas d'HS).
      totalOvertimeHours += Math.max(0, taskH - emp.weeklyHours);
      totalEffectiveHours += (b.task + b.paidAbsence) * SLOT_HOURS;
      weekly.push({ weekStart: key, taskHours: taskH });
    }
    // Titulaire en mode "dividendes / salaire fixe" (défaut) : ses heures sup
    // ne sont PAS comptabilisées (il travaille quoi qu'il arrive). Le solde
    // HS-Abs n'a alors pas de sens non plus → 0. Les autres statuts (et les
    // titulaires ayant explicitement choisi le mode "classique") comptent
    // normalement.
    const countsOvertime =
      emp.status !== "TITULAIRE" || emp.titulaireCountsOvertime;
    const overtimeHours = countsOvertime ? totalOvertimeHours : 0;
    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      status: emp.status,
      weeklyHours: emp.weeklyHours,
      displayColor: emp.displayColor,
      taskHours: totalTaskHours,
      absenceHours: totalAbsenceHours,
      overtimeHours,
      hsAbsBalance: countsOvertime ? overtimeHours - totalAbsenceHours : 0,
      weekCount: weekly.length,
      // Moyenne hebdo EFFECTIVE (travail + absences rémunérées) — comparée au
      // contrat pour la classification sur/sous-contrat et la tonalité.
      avgWeeklyHours: weekly.length > 0 ? totalEffectiveHours / weekly.length : 0,
      weekly,
    };
  });
}

/** Totaux équipe à partir des stats individuelles. */
function totalsFrom(stats: EmployeeStat[]): PeriodTotals {
  return stats.reduce<PeriodTotals>(
    (acc, e) => {
      acc.task += e.taskHours;
      acc.absence += e.absenceHours;
      acc.overtime += e.overtimeHours;
      if (e.weekCount > 0 && e.avgWeeklyHours > e.weeklyHours + 0.5)
        acc.overContract += 1;
      if (e.weekCount > 0 && e.avgWeeklyHours < e.weeklyHours - 0.5)
        acc.underContract += 1;
      return acc;
    },
    { task: 0, overtime: 0, absence: 0, overContract: 0, underContract: 0 }
  );
}

/** Date de référence pour la période PRÉCÉDENTE (null si non pertinent). */
function previousNow(period: StatsPeriod, now: Date): Date | null {
  if (period === "all") return null;
  if (period === "week") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 7);
    return d;
  }
  // ⚠️ Pour month/semester on NE recule PAS avec setUTCMonth sur `now` : sur un
  // 29/30/31, le mois cible déborde (ex. 31 mai − 1 mois → "31 avril" = 1er mai)
  // et la "période précédente" chevauche la période courante. On reconstruit
  // donc la date au 15 du mois cible (jour neutre, jamais en débordement).
  const months = period === "month" ? 1 : 6;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 15)
  );
}

/**
 * Calcule les statistiques par collaborateur sur la période donnée + les
 * totaux de la période PRÉCÉDENTE (pour la comparaison ↑/↓).
 * Agrégation en mémoire : OK car la plage est bornée (~14k entrées max).
 */
export async function computeStats(
  pharmacyId: string,
  period: StatsPeriod
): Promise<{
  employees: EmployeeStat[];
  periodLabel: string;
  previous: PeriodTotals | null;
}> {
  const range = getPeriodRange(period);
  // La plage de la période précédente ne dépend que de `period` (aucune requête)
  // → on la calcule d'abord pour lancer les 3 lectures EN PARALLÈLE.
  const prevNow = previousNow(period, new Date());
  const prevRange = prevNow ? getPeriodRange(period, prevNow) : null;

  // 3 requêtes indépendantes en parallèle (au lieu de 3 allers-retours série).
  const [employees, entries, prevEntries] = await Promise.all([
    prisma.employee.findMany({
      where: { pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        weeklyHours: true,
        displayColor: true,
        titulaireCountsOvertime: true,
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        pharmacyId,
        ...(period === "all"
          ? {}
          : { date: { gte: range.start, lt: range.end } }),
      },
      select: { employeeId: true, type: true, date: true, absenceCode: true },
    }),
    prevRange
      ? prisma.scheduleEntry.findMany({
          where: {
            pharmacyId,
            date: { gte: prevRange.start, lt: prevRange.end },
          },
          select: { employeeId: true, type: true, date: true, absenceCode: true },
        })
      : Promise.resolve(null),
  ]);

  const stats = buildEmployeeStats(employees, entries);
  const previous: PeriodTotals | null = prevEntries
    ? totalsFrom(buildEmployeeStats(employees, prevEntries))
    : null;

  return { employees: stats, periodLabel: range.label, previous };
}
