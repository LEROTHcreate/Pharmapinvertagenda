import { ScheduleType } from "@prisma/client";
import { TIME_SLOTS, SLOT_HOURS, WEEK_DAYS } from "@/types";
import type { EmployeeDayMap } from "@/lib/planning-utils";

/**
 * Moteur de conformité au droit du travail / Convention collective de la
 * Pharmacie d'officine (IDCC 1996) appliqué au planning d'une semaine.
 *
 * Détecte les manquements AVANT publication du planning :
 *  - repos quotidien (11 h entre deux journées),
 *  - repos hebdomadaire (35 h / au moins un jour de repos),
 *  - durée maximale quotidienne (10 h) et hebdomadaire (48 h),
 *  - amplitude de la journée (≤ 13 h),
 *  - coupures (journée fractionnée en > 2 séquences, coupure trop longue),
 *  - pause (20 min après 6 h de travail continu).
 *
 * Fournit aussi le détail des heures supplémentaires majorées (25 % / 50 %).
 *
 * Le but : éviter les litiges prud'hommes et donner à l'admin une alerte
 * claire et motivée. Tous les seuils sont configurables (accords d'entreprise).
 */

export type CcnViolationType =
  | "REPOS_QUOTIDIEN"
  | "REPOS_HEBDO"
  | "DUREE_MAX_JOUR"
  | "DUREE_MAX_SEMAINE"
  | "AMPLITUDE"
  | "COUPURE"
  | "PAUSE";

export type CcnViolation = {
  type: CcnViolationType;
  /** "error" = illégal ; "warning" = à vérifier / limite. */
  severity: "error" | "warning";
  employeeId: string;
  employeeName: string;
  /** Jour concerné (ISO YYYY-MM-DD) si applicable. */
  date?: string;
  /** Motif lisible affiché à l'admin. */
  message: string;
};

export type CcnThresholds = {
  reposQuotidienMin: number;
  reposHebdoMin: number;
  dureeMaxJourMin: number;
  dureeMaxSemaineMin: number;
  amplitudeMaxMin: number;
  coupureMaxMin: number;
  maxCoupures: number;
  pauseApresMin: number;
};

export const CCN_DEFAULTS: CcnThresholds = {
  reposQuotidienMin: 11 * 60, // 11 h entre deux journées (Code du travail)
  reposHebdoMin: 35 * 60, // 35 h consécutives / semaine
  dureeMaxJourMin: 10 * 60, // 10 h de travail effectif / jour
  dureeMaxSemaineMin: 48 * 60, // 48 h / semaine
  amplitudeMaxMin: 13 * 60, // amplitude max (début → fin de journée)
  coupureMaxMin: 2 * 60, // au-delà : coupure trop longue
  maxCoupures: 1, // 1 coupure max (journée en 2 séquences)
  pauseApresMin: 6 * 60, // pause 20 min après 6 h de travail continu
};

type Interval = { from: number; to: number }; // minutes depuis minuit
type DayWork = {
  date: string;
  /** Index du jour dans weekDates (0 = lundi). */
  dayIndex: number;
  firstStart: number;
  lastEnd: number;
  workedMin: number;
  intervals: Interval[];
  coupures: Interval[];
};

function slotToMin(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

const fmtH = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h${String(m).padStart(2, "0")}`;
};

/** Reconstruit la journée de travail (TÂCHES) d'un employé en intervalles. */
function buildDayWork(
  empId: string,
  date: string,
  dayIndex: number,
  index: Map<string, EmployeeDayMap>
): DayWork | null {
  const day = index.get(empId)?.get(date);
  if (!day) return null;

  const taskMins: number[] = [];
  for (const slot of TIME_SLOTS) {
    const e = day.get(slot);
    if (e?.type === ScheduleType.TASK) taskMins.push(slotToMin(slot));
  }
  if (taskMins.length === 0) return null;
  taskMins.sort((a, b) => a - b);

  // Regroupe les créneaux 30 min contigus en intervalles continus.
  const intervals: Interval[] = [];
  let curFrom = taskMins[0];
  let prev = taskMins[0];
  for (let i = 1; i < taskMins.length; i++) {
    if (taskMins[i] === prev + 30) {
      prev = taskMins[i];
      continue;
    }
    intervals.push({ from: curFrom, to: prev + 30 });
    curFrom = taskMins[i];
    prev = taskMins[i];
  }
  intervals.push({ from: curFrom, to: prev + 30 });

  const workedMin = intervals.reduce((s, iv) => s + (iv.to - iv.from), 0);
  const coupures: Interval[] = [];
  for (let i = 1; i < intervals.length; i++) {
    coupures.push({ from: intervals[i - 1].to, to: intervals[i].from });
  }

  return {
    date,
    dayIndex,
    firstStart: intervals[0].from,
    lastEnd: intervals[intervals.length - 1].to,
    workedMin,
    intervals,
    coupures,
  };
}

const dayLabel = (i: number): string => (WEEK_DAYS[i] ?? `J${i + 1}`).toLowerCase();

/**
 * Analyse la conformité du planning de la semaine pour la liste d'employés.
 * Renvoie la liste des manquements (vide = planning conforme).
 */
export function analyzeCcnCompliance(
  employees: Array<{ id: string; firstName: string }>,
  weekDates: string[],
  index: Map<string, EmployeeDayMap>,
  thresholds: Partial<CcnThresholds> = {}
): CcnViolation[] {
  const o = { ...CCN_DEFAULTS, ...thresholds };
  const out: CcnViolation[] = [];

  for (const emp of employees) {
    const name = emp.firstName;
    const works = weekDates.map((d, i) => buildDayWork(emp.id, d, i, index));
    const workedDays = works.filter((w): w is DayWork => w !== null);

    // ─── Règles journalières ───
    for (const w of workedDays) {
      const jour = dayLabel(w.dayIndex);

      if (w.workedMin > o.dureeMaxJourMin) {
        out.push({
          type: "DUREE_MAX_JOUR",
          severity: "error",
          employeeId: emp.id,
          employeeName: name,
          date: w.date,
          message: `${name} — ${jour} : ${fmtH(w.workedMin)} de travail (max légal ${fmtH(o.dureeMaxJourMin)}/jour).`,
        });
      }

      const amplitude = w.lastEnd - w.firstStart;
      if (amplitude > o.amplitudeMaxMin) {
        out.push({
          type: "AMPLITUDE",
          severity: "warning",
          employeeId: emp.id,
          employeeName: name,
          date: w.date,
          message: `${name} — ${jour} : amplitude de ${fmtH(amplitude)} (max ${fmtH(o.amplitudeMaxMin)}).`,
        });
      }

      if (w.coupures.length > o.maxCoupures) {
        out.push({
          type: "COUPURE",
          severity: "warning",
          employeeId: emp.id,
          employeeName: name,
          date: w.date,
          message: `${name} — ${jour} : journée fractionnée en ${w.intervals.length} séquences (max ${o.maxCoupures + 1}, soit ${o.maxCoupures} coupure${o.maxCoupures > 1 ? "s" : ""}).`,
        });
      }
      for (const c of w.coupures) {
        if (c.to - c.from > o.coupureMaxMin) {
          out.push({
            type: "COUPURE",
            severity: "warning",
            employeeId: emp.id,
            employeeName: name,
            date: w.date,
            message: `${name} — ${jour} : coupure de ${fmtH(c.to - c.from)} (au-delà de ${fmtH(o.coupureMaxMin)}).`,
          });
        }
      }
      // Pause obligatoire : dès que le temps de travail quotidien ATTEINT 6 h
      // (≥, pas >), une pause d'au moins 20 min est due. Dans la granularité du
      // planning (créneaux de 30 min) toute coupure vaut ≥ 30 min, donc l'absence
      // de la moindre coupure sur une journée ≥ 6 h = pause manquante.
      const PAUSE_MIN_MINUTES = 20;
      if (
        w.workedMin >= o.pauseApresMin &&
        !w.coupures.some((c) => c.to - c.from >= PAUSE_MIN_MINUTES)
      ) {
        out.push({
          type: "PAUSE",
          severity: "warning",
          employeeId: emp.id,
          employeeName: name,
          date: w.date,
          message: `${name} — ${jour} : ${fmtH(w.workedMin)} de travail sans pause d'au moins 20 min (obligatoire dès ${fmtH(o.pauseApresMin)}).`,
        });
      }
    }

    // ─── Repos quotidien entre deux journées travaillées consécutives ───
    for (let i = 1; i < works.length; i++) {
      const prev = works[i - 1];
      const cur = works[i];
      if (!prev || !cur) continue; // un jour off → repos large, pas de souci
      const rest = 24 * 60 - prev.lastEnd + cur.firstStart;
      if (rest < o.reposQuotidienMin) {
        out.push({
          type: "REPOS_QUOTIDIEN",
          severity: "error",
          employeeId: emp.id,
          employeeName: name,
          date: cur.date,
          message: `${name} : seulement ${fmtH(rest)} de repos entre ${dayLabel(prev.dayIndex)} et ${dayLabel(cur.dayIndex)} (min légal 11 h).`,
        });
      }
    }

    // ─── Durée hebdomadaire ───
    const weekMin = workedDays.reduce((s, w) => s + w.workedMin, 0);
    if (weekMin > o.dureeMaxSemaineMin) {
      out.push({
        type: "DUREE_MAX_SEMAINE",
        severity: "error",
        employeeId: emp.id,
        employeeName: name,
        message: `${name} : ${fmtH(weekMin)} sur la semaine (max légal ${fmtH(o.dureeMaxSemaineMin)}).`,
      });
    }

    // ─── Repos hebdomadaire ───
    // Au moins un jour de repos dans la semaine garantit > 35 h de repos
    // (jour off + nuits adjacentes). Sinon (travaille tous les jours saisis),
    // on alerte pour vérifier le repos hebdomadaire (souvent le dimanche, non
    // saisi dans le planning Lun→Sam).
    if (workedDays.length >= weekDates.length && weekDates.length >= 6) {
      out.push({
        type: "REPOS_HEBDO",
        severity: "warning",
        employeeId: emp.id,
        employeeName: name,
        message: `${name} : aucun jour de repos sur la semaine saisie — vérifier le repos hebdomadaire de 35 h.`,
      });
    }

    // ─── Maximum 6 jours consécutifs (le 7e doit être un repos) ───
    // Donnée limitée à la semaine saisie (souvent Lun→Sam = 6 jours max
    // visibles, ce qui est légal). On détecte tout de même la plus longue
    // série de jours travaillés d'affilée : 7+ consécutifs = illégal (utile
    // si la semaine saisie couvre le dimanche ou plus de 6 colonnes).
    let run = 0;
    let maxRun = 0;
    for (const w of works) {
      if (w) {
        run++;
        if (run > maxRun) maxRun = run;
      } else {
        run = 0;
      }
    }
    if (maxRun >= 7) {
      out.push({
        type: "REPOS_HEBDO",
        severity: "error",
        employeeId: emp.id,
        employeeName: name,
        message: `${name} : ${maxRun} jours travaillés consécutifs (max légal 6, un repos hebdomadaire est obligatoire).`,
      });
    }
  }

  return out;
}

/* ─── Heures supplémentaires majorées (25 % / 50 %) ──────────────────── */

export type OvertimeBreakdown = {
  /** Heures effectuées dans la semaine. */
  workedHours: number;
  /** Heures normales (≤ 35 h). */
  normalHours: number;
  /** Heures sup à +25 % (36e → 43e heure). */
  hs25: number;
  /** Heures sup à +50 % (au-delà de la 43e heure). */
  hs50: number;
};

/**
 * Décompose les heures hebdomadaires en normales / +25 % / +50 %.
 * Base légale : majoration de 25 % pour les 8 premières heures sup
 * (36e à 43e), 50 % au-delà (à partir de la 44e heure).
 */
export function weeklyOvertimeBreakdown(
  workedHours: number,
  legalWeek = 35
): OvertimeBreakdown {
  const normalHours = Math.min(workedHours, legalWeek);
  const sup = Math.max(0, workedHours - legalWeek);
  const hs25 = Math.min(sup, 8);
  const hs50 = Math.max(0, sup - 8);
  return { workedHours, normalHours, hs25, hs50 };
}

/** Total des heures travaillées (TÂCHES) d'un employé sur la semaine, en heures. */
export function weeklyWorkedHours(
  empId: string,
  weekDates: string[],
  index: Map<string, EmployeeDayMap>
): number {
  let slots = 0;
  for (const d of weekDates) {
    const day = index.get(empId)?.get(d);
    if (!day) continue;
    day.forEach((e) => {
      if (e.type === ScheduleType.TASK) slots++;
    });
  }
  return slots * SLOT_HOURS;
}
