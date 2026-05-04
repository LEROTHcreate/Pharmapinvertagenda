import { ScheduleType, type AbsenceCode, type TaskCode } from "@prisma/client";
import type { ScheduleEntryDTO } from "@/types";
import { SLOT_HOURS, TIME_SLOTS } from "@/types";

/** Format ISO YYYY-MM-DD à partir d'une Date (timezone locale) */
export function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Lundi 00:00 de la semaine contenant la date d (ISO week-start = Lundi) */
export function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=dim, 1=lun, ..., 6=sam
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

/** Tableau des 6 dates de la semaine (Lun → Sam) */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/** Numéro de semaine ISO (1-53) */
export function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Lun=0
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

/** S1 si numéro de semaine impair, S2 si pair (convention courante) */
export function weekTypeFor(d: Date): "S1" | "S2" {
  return isoWeekNumber(d) % 2 === 1 ? "S1" : "S2";
}

/** Map (date → timeSlot → entrée) pour un collaborateur donné */
export type EmployeeDayMap = Map<string, Map<string, ScheduleEntryDTO>>;

export function indexEntriesByEmployee(
  entries: ScheduleEntryDTO[]
): Map<string, EmployeeDayMap> {
  const result = new Map<string, EmployeeDayMap>();
  for (const e of entries) {
    let perEmployee = result.get(e.employeeId);
    if (!perEmployee) {
      perEmployee = new Map();
      result.set(e.employeeId, perEmployee);
    }
    let perDay = perEmployee.get(e.date);
    if (!perDay) {
      perDay = new Map();
      perEmployee.set(e.date, perDay);
    }
    perDay.set(e.timeSlot, e);
  }
  return result;
}

/**
 * Heures « comptabilisées » sur une journée pour un collaborateur.
 *
 * Inclut :
 *  - TASK (postes effectivement travaillés)
 *  - ABSENCE rémunérée : CONGE, MALADIE, FORMATION_ABS — l'employé a
 *    droit à ces heures dans son décompte hebdo (congés payés, arrêt
 *    maladie indemnisé, formation prise sur le temps de travail).
 *
 * Exclut :
 *  - ABSENT (sans précision) — le motif n'étant pas validé comme
 *    rémunéré, on n'incrémente pas le compteur.
 */
export function dailyTaskHours(
  employeeId: string,
  isoDate: string,
  index: Map<string, EmployeeDayMap>
): number {
  const day = index.get(employeeId)?.get(isoDate);
  if (!day) return 0;
  let count = 0;
  day.forEach((e) => {
    if (e.type === ScheduleType.TASK) {
      count++;
    } else if (
      e.type === ScheduleType.ABSENCE &&
      (e.absenceCode === "CONGE" ||
        e.absenceCode === "MALADIE" ||
        e.absenceCode === "FORMATION_ABS")
    ) {
      // Absence rémunérée → compte comme heures travaillées pour le
      // décompte du contrat hebdo (sinon le collaborateur en congé
      // apparaîtrait à -X heures sous son contrat, ce qui est faux).
      count++;
    }
  });
  return count * SLOT_HOURS;
}

/** Heures totales TASK sur la semaine pour un collaborateur */
export function weeklyTaskHours(
  employeeId: string,
  weekDates: string[],
  index: Map<string, EmployeeDayMap>
): number {
  return weekDates.reduce(
    (sum, d) => sum + dailyTaskHours(employeeId, d, index),
    0
  );
}

/**
 * Calcule l'ensemble des cellules en heures sup pour la semaine.
 * On marque chaque créneau TASK qui fait passer le cumul au-dessus du contrat.
 * Format des clés : "employeeId|date|timeSlot".
 */
export function computeOvertimeCells(
  employees: Array<{ id: string; weeklyHours: number }>,
  weekDates: string[],
  timeSlots: string[],
  index: Map<string, EmployeeDayMap>
): Set<string> {
  const out = new Set<string>();
  for (const emp of employees) {
    const contractSlots = emp.weeklyHours / SLOT_HOURS;
    let cumSlots = 0;
    for (const date of weekDates) {
      for (const slot of timeSlots) {
        const e = index.get(emp.id)?.get(date)?.get(slot);
        if (e?.type === ScheduleType.TASK) {
          cumSlots++;
          if (cumSlots > contractSlots) {
            out.add(`${emp.id}|${date}|${slot}`);
          }
        }
      }
    }
  }
  return out;
}

/** Effectif présent (TASK) sur un créneau donné (un jour, un timeSlot) */
export function staffingForSlot(
  isoDate: string,
  timeSlot: string,
  employeeIds: string[],
  index: Map<string, EmployeeDayMap>
): number {
  let count = 0;
  for (const id of employeeIds) {
    const e = index.get(id)?.get(isoDate)?.get(timeSlot);
    if (e?.type === ScheduleType.TASK) count++;
  }
  return count;
}

export type StaffingLevel = "ok" | "warning" | "critical";

export function staffingLevel(count: number, minStaff: number): StaffingLevel {
  if (count >= minStaff) return "ok";
  if (count >= Math.ceil(minStaff / 2)) return "warning";
  return "critical";
}

/** Retourne la valeur affichable d'une cellule (libellé) */
export function cellLabel(
  type: ScheduleType,
  taskCode: TaskCode | null,
  absenceCode: AbsenceCode | null,
  TASK_LABELS: Record<TaskCode, string>,
  ABSENCE_LABELS: Record<AbsenceCode, string>
): string {
  if (type === ScheduleType.TASK && taskCode) return TASK_LABELS[taskCode];
  if (type === ScheduleType.ABSENCE && absenceCode)
    return ABSENCE_LABELS[absenceCode];
  return "";
}

/** Re-export pour confort */
export { TIME_SLOTS };
