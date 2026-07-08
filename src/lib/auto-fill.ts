import type { EmployeeStatus, TaskCode } from "@prisma/client";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { isNonWorkedTask } from "@/types";
import type { WeekHours } from "@/lib/opening-hours";

/**
 * Générateur « Remplir automatiquement » — COMPLÈTE la couverture COMPTOIR.
 *
 * Principe (volontairement simple et prévisible) : sur les heures d'ouverture,
 * pour chaque créneau où l'effectif comptoir est SOUS le seuil mini, on affecte
 * COMPTOIR à un collaborateur comptoir-capable :
 *  - pas absent ce jour (absence validée ou cellule ABSENCE) ;
 *  - pas indisponible (souhait UNAVAILABLE) ;
 *  - dont la case est LIBRE (on ne complète que les trous, jamais d'écrasement) ;
 *  - qui n'a pas atteint ses heures contractuelles de la semaine.
 *
 * Choix du collaborateur : on privilégie la CONTINUITÉ (prolonger un poste déjà
 * occupé au créneau précédent), puis les souhaits « souhaite travailler », puis
 * ceux qui ont le plus de marge d'heures. Résultat = une base à ajuster, pas un
 * planning parfait.
 */

const COMPTOIR: TaskCode = "COMPTOIR";

export type AutoFillEmployee = {
  id: string;
  status: EmployeeStatus;
  weeklyHours: number;
};
export type AutoFillEntry = {
  employeeId: string;
  date: string; // ISO YYYY-MM-DD
  timeSlot: string;
  type: "TASK" | "ABSENCE";
  taskCode: TaskCode | null;
};
export type AutoFillWish = {
  employeeId: string;
  date: string;
  kind: "UNAVAILABLE" | "PREFER_OFF" | "PREFER_WORK";
};
export type AutoFillAbsence = {
  employeeId: string;
  startIso: string;
  endIso: string;
};

export type AutoFillRow = { employeeId: string; date: string; timeSlot: string };

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Un créneau "HH:MM" tombe-t-il dans l'une des plages d'ouverture du jour ? */
function slotOpen(slot: string, ranges: WeekHours[number]): boolean {
  const m = toMin(slot);
  return ranges.some((r) => m >= toMin(r.open) && m < toMin(r.close));
}

export function fillComptoirGaps(input: {
  /** 6 dates ISO Lun→Sam (dans cet ordre). */
  weekDates: string[];
  /** Tous les créneaux de la grille ("HH:MM"). */
  timeSlots: string[];
  /** Horaires d'ouverture (7 jours Lun→Dim). */
  openingHours: WeekHours;
  minStaff: number;
  employees: AutoFillEmployee[];
  existing: AutoFillEntry[];
  wishes: AutoFillWish[];
  absences: AutoFillAbsence[];
}): AutoFillRow[] {
  const { weekDates, timeSlots, openingHours, minStaff, employees } = input;

  const statusById = new Map(employees.map((e) => [e.id, e.status]));
  const comptoirCapable = (id: string) => {
    const s = statusById.get(id);
    return s ? isTaskAllowed(s, COMPTOIR) : false;
  };

  // Heures TASK (hors échange) déjà posées cette semaine, par collaborateur.
  const hours = new Map<string, number>();
  // Case occupée (n'importe quel type) → on ne réécrit jamais dessus.
  const occupied = new Set<string>();
  // Effectif comptoir déjà présent par (date|slot).
  const staffing = new Map<string, number>();
  for (const e of input.existing) {
    occupied.add(`${e.employeeId}|${e.date}|${e.timeSlot}`);
    if (e.type === "TASK" && e.taskCode && !isNonWorkedTask(e.taskCode)) {
      hours.set(e.employeeId, (hours.get(e.employeeId) ?? 0) + 0.5);
      if (comptoirCapable(e.employeeId)) {
        const k = `${e.date}|${e.timeSlot}`;
        staffing.set(k, (staffing.get(k) ?? 0) + 1);
      }
    }
  }

  // Absent ce jour (absence validée couvrant la date OU cellule ABSENCE).
  const absentDay = new Set<string>();
  const weekSet = new Set(weekDates);
  for (const a of input.absences) {
    for (const d of weekDates) {
      if (d >= a.startIso && d <= a.endIso) absentDay.add(`${a.employeeId}|${d}`);
    }
  }
  for (const e of input.existing) {
    if (e.type === "ABSENCE" && weekSet.has(e.date)) {
      absentDay.add(`${e.employeeId}|${e.date}`);
    }
  }

  // Souhait de dispo par (emp|date).
  const wishOf = new Map<string, AutoFillWish["kind"]>();
  for (const w of input.wishes) wishOf.set(`${w.employeeId}|${w.date}`, w.kind);

  const comptoir = employees.filter((e) => comptoirCapable(e.id));
  const slotIndex = new Map(timeSlots.map((s, i) => [s, i]));
  const added: AutoFillRow[] = [];

  for (let i = 0; i < weekDates.length; i++) {
    const dateIso = weekDates[i];
    // weekDates est Lun→Sam → l'index i correspond au jour 0=Lun…5=Sam,
    // aligné sur openingHours (7 jours Lun→Dim).
    const ranges = openingHours[i] ?? [];
    if (ranges.length === 0) continue; // fermé ce jour

    const avail = comptoir.filter(
      (e) =>
        !absentDay.has(`${e.id}|${dateIso}`) &&
        wishOf.get(`${e.id}|${dateIso}`) !== "UNAVAILABLE"
    );
    if (avail.length === 0) continue;

    for (const slot of timeSlots) {
      if (!slotOpen(slot, ranges)) continue;
      const key = `${dateIso}|${slot}`;
      let cur = staffing.get(key) ?? 0;
      const prevSlot = timeSlots[(slotIndex.get(slot) ?? 0) - 1];

      while (cur < minStaff) {
        const candidates = avail.filter(
          (e) =>
            (hours.get(e.id) ?? 0) + 0.5 <= e.weeklyHours &&
            !occupied.has(`${e.id}|${dateIso}|${slot}`)
        );
        if (candidates.length === 0) break;

        const score = (e: AutoFillEmployee): number => {
          let s = e.weeklyHours - (hours.get(e.id) ?? 0); // marge d'heures
          if (prevSlot && occupied.has(`${e.id}|${dateIso}|${prevSlot}`)) s += 1000; // continuité
          const wish = wishOf.get(`${e.id}|${dateIso}`);
          if (wish === "PREFER_WORK") s += 100;
          if (wish === "PREFER_OFF") s -= 100;
          return s;
        };
        candidates.sort((a, b) => score(b) - score(a));
        const pick = candidates[0];

        added.push({ employeeId: pick.id, date: dateIso, timeSlot: slot });
        occupied.add(`${pick.id}|${dateIso}|${slot}`);
        hours.set(pick.id, (hours.get(pick.id) ?? 0) + 0.5);
        cur++;
        staffing.set(key, cur);
      }
    }
  }

  return added;
}
