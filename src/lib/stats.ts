import { prisma } from "@/lib/prisma";
import { ScheduleType } from "@prisma/client";
import { SLOT_HOURS } from "@/types";
import type { EmployeeStatus } from "@prisma/client";

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
    // Lundi de la semaine courante (pharma fermée dimanche, on aligne sur ISO)
    const day = now.getUTCDay(); // 0=dim, 1=lun…6=sam
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    monday.setUTCDate(monday.getUTCDate() + diff);
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

/**
 * Calcule les statistiques par collaborateur sur la période donnée.
 * - 1 seule requête SQL paramétrée (filtrée par pharmacyId + plage de dates)
 * - Agrégation en mémoire : OK car la plage est bornée (1 semestre = ~14k entrées max)
 */
export async function computeStats(
  pharmacyId: string,
  period: StatsPeriod
): Promise<{ employees: EmployeeStat[]; periodLabel: string }> {
  const range = getPeriodRange(period);

  const [employees, entries] = await Promise.all([
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
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        pharmacyId,
        ...(period === "all"
          ? {}
          : { date: { gte: range.start, lt: range.end } }),
      },
      select: { employeeId: true, type: true, date: true },
    }),
  ]);

  // Bucketing : { employeeId → { weekStart → { task, absence } } }
  const byEmp = new Map<
    string,
    Map<string, { task: number; absence: number }>
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
      bucket = { task: 0, absence: 0 };
      weeks.set(weekKey, bucket);
    }
    if (e.type === ScheduleType.TASK) bucket.task += 1;
    else if (e.type === ScheduleType.ABSENCE) bucket.absence += 1;
  }

  const stats: EmployeeStat[] = employees.map((emp) => {
    const weeks = byEmp.get(emp.id) ?? new Map();
    const sortedKeys = Array.from(weeks.keys()).sort();
    let totalTaskHours = 0;
    let totalAbsenceHours = 0;
    let totalOvertimeHours = 0;
    const weekly: Array<{ weekStart: string; taskHours: number }> = [];
    for (const key of sortedKeys) {
      const b = weeks.get(key)!;
      const taskH = b.task * SLOT_HOURS;
      const absH = b.absence * SLOT_HOURS;
      totalTaskHours += taskH;
      totalAbsenceHours += absH;
      totalOvertimeHours += Math.max(0, taskH - emp.weeklyHours);
      weekly.push({ weekStart: key, taskHours: taskH });
    }
    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      status: emp.status,
      weeklyHours: emp.weeklyHours,
      displayColor: emp.displayColor,
      taskHours: totalTaskHours,
      absenceHours: totalAbsenceHours,
      overtimeHours: totalOvertimeHours,
      hsAbsBalance: totalOvertimeHours - totalAbsenceHours,
      weekly,
    };
  });

  return { employees: stats, periodLabel: range.label };
}
