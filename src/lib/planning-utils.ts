import { ScheduleType, type AbsenceCode, type TaskCode } from "@prisma/client";
import type { ScheduleEntryDTO } from "@/types";
import { SLOT_HOURS, TIME_SLOTS, isNonWorkedTask } from "@/types";

/**
 * Format ISO YYYY-MM-DD à partir d'une Date — ou d'une string.
 *
 * IMPORTANT : `unstable_cache` (Next.js) SÉRIALISE son résultat. Les champs
 * `Date` reviennent donc en **string ISO** au cache-hit (ex.
 * "2026-06-29T00:00:00.000Z"). Appeler `d.getFullYear()` dessus plante
 * ("d.getFullYear is not a function") → crash serveur de /planning et /infos
 * (qui lisent `getCachedWeekEntries`). On accepte donc les deux formes.
 */
export function toIsoDate(d: Date | string): string {
  if (typeof d === "string") {
    // Déjà une chaîne ISO (Date sérialisée par le cache) → on garde le jour.
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    d = new Date(d);
  }
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

/**
 * Type de semaine S1/S2 (alternance). Convention de CETTE officine :
 * semaine ISO PAIRE = S1, IMPAIRE = S2 (calée pour que la semaine ISO 28,
 * du 5–11 juillet 2026, soit S1). Point unique qui pilote l'étiquette S1/S2
 * partout (en-tête planning, impressions). N'affecte PAS le contenu appliqué
 * (les gabarits sont choisis explicitement à l'application).
 */
export function weekTypeFor(d: Date): "S1" | "S2" {
  return isoWeekNumber(d) % 2 === 0 ? "S1" : "S2";
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
    if (e.type === ScheduleType.TASK && !isNonWorkedTask(e.taskCode)) {
      // ECHANGE (texturé) = la personne n'est pas là → n'incrémente pas.
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
        if (e?.type === ScheduleType.TASK && !isNonWorkedTask(e.taskCode)) {
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

/**
 * Effectif présent (TASK) sur un créneau donné (un jour, un timeSlot).
 *
 * - `counterIds` : collaborateurs "comptoir" (pharmaciens + préparateurs +
 *   étudiants) → toute vraie tâche compte.
 * - `allIds` (optionnel) : tous les collaborateurs. Si fourni, un
 *   REMPLACEMENT compte quel que soit le rôle du remplaçant — il couvre
 *   physiquement le comptoir à la place de l'absent (cf. ECHANGE en face,
 *   texturé et hors effectif). Sans `allIds` : comportement historique
 *   (seuls les `counterIds` sont comptés).
 *
 * ECHANGE (texturé) = personne pas présente → toujours hors effectif.
 *
 * COMMANDE (réception/gestion des commandes) = travail de back-office : la
 * personne n'est PAS au comptoir → exclue du décompte d'effectif, même pour un
 * rôle comptoir (un préparateur qui gère les commandes ne sert pas les patients).
 */
export function staffingForSlot(
  isoDate: string,
  timeSlot: string,
  counterIds: string[],
  index: Map<string, EmployeeDayMap>,
  allIds?: string[]
): number {
  const counter = new Set(counterIds);
  const ids = allIds ?? counterIds;
  let count = 0;
  for (const id of ids) {
    const e = index.get(id)?.get(isoDate)?.get(timeSlot);
    if (e?.type !== ScheduleType.TASK || isNonWorkedTask(e.taskCode)) continue;
    // COMMANDE = back-office, pas une présence comptoir → jamais compté.
    if (e.taskCode === "COMMANDE") continue;
    // Rôle comptoir sur une vraie tâche → compte.
    // OU n'importe qui en REMPLACEMENT (il couvre le comptoir) → compte.
    if (counter.has(id) || e.taskCode === "REMPLACEMENT") count++;
  }
  return count;
}

export type StaffingLevel = "ok" | "warning" | "critical";

export function staffingLevel(count: number, minStaff: number): StaffingLevel {
  if (count >= minStaff) return "ok";
  // Orange (warning) UNIQUEMENT juste sous le minimum (ex. 3 si min = 4) ;
  // en-dessous (≤ 2 si min = 4) → rouge (critical).
  if (count >= minStaff - 1) return "warning";
  return "critical";
}

/** Un « trou » de couverture : une plage horaire contiguë sous le seuil. */
export type CoverageHole = {
  from: string; // "HH:MM" début (inclus)
  to: string; // "HH:MM" fin (exclus)
  level: Exclude<StaffingLevel, "ok">; // pire niveau sur la plage
  minCount: number; // effectif le plus bas sur la plage
};

/** Couverture d'un jour = ses trous (vide si tout est OK). */
export type DayCoverage = {
  date: string;
  dayIndex: number; // 0=Lun … 5=Sam (position dans weekDates)
  holes: CoverageHole[];
};

/** Fin d'un créneau "HH:MM" → +30 min (pour borner une plage). */
function slotEnd(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const t = h * 60 + m + 30;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Récapitule les créneaux en SOUS-EFFECTIF de la semaine (calé sur la colonne
 * EFF de la grille : effectif comptoir < seuil `minStaff`).
 *
 * Pour chaque jour, on ne considère que l'« enveloppe de travail » (du premier
 * au dernier créneau où au moins une personne comptoir est en poste) → on évite
 * les faux positifs avant l'ouverture / après la fermeture. Les créneaux sous
 * le seuil y sont regroupés en plages contiguës, avec le pire niveau et
 * l'effectif minimum de chaque plage.
 *
 * `allIds` (optionnel) : fait compter les REMPLACEMENT de n'importe quel rôle,
 * comme `staffingForSlot`.
 */
export function weekUnderstaffing(
  weekDates: string[],
  counterIds: string[],
  index: Map<string, EmployeeDayMap>,
  minStaff: number,
  allIds?: string[]
): DayCoverage[] {
  const out: DayCoverage[] = [];

  weekDates.forEach((date, dayIndex) => {
    // Effectif comptoir par créneau (1 seul passage), puis enveloppe de travail.
    const counts = TIME_SLOTS.map((slot) =>
      staffingForSlot(date, slot, counterIds, index, allIds)
    );
    let first = -1;
    let last = -1;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) {
        if (first === -1) first = i;
        last = i;
      }
    }
    if (first === -1) return; // journée sans personne au comptoir → ignorée

    const holes: CoverageHole[] = [];
    let cur:
      | { fromIdx: number; toIdx: number; level: Exclude<StaffingLevel, "ok">; minCount: number }
      | null = null;
    for (let i = first; i <= last; i++) {
      const level = staffingLevel(counts[i], minStaff);
      if (level === "ok") {
        if (cur) {
          holes.push({
            from: TIME_SLOTS[cur.fromIdx],
            to: slotEnd(TIME_SLOTS[cur.toIdx]),
            level: cur.level,
            minCount: cur.minCount,
          });
          cur = null;
        }
      } else if (cur) {
        cur.toIdx = i;
        cur.minCount = Math.min(cur.minCount, counts[i]);
        if (level === "critical") cur.level = "critical";
      } else {
        cur = { fromIdx: i, toIdx: i, level, minCount: counts[i] };
      }
    }
    if (cur) {
      holes.push({
        from: TIME_SLOTS[cur.fromIdx],
        to: slotEnd(TIME_SLOTS[cur.toIdx]),
        level: cur.level,
        minCount: cur.minCount,
      });
    }
    if (holes.length > 0) out.push({ date, dayIndex, holes });
  });

  return out;
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
