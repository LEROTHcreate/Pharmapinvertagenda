import { ScheduleType, type AbsenceCode } from "@prisma/client";
import { SLOT_HOURS } from "@/types";
import type { EmployeeDayMap } from "@/lib/planning-utils";

/**
 * Moteur de compteurs de congés / temps de travail — logique pure.
 *
 * Couvre les besoins d'une officine française :
 *  - Congés payés (CP) : acquisition 2,5 jours ouvrables / mois sur la période
 *    de référence légale (1er juin → 31 mai), solde acquis / pris / restant.
 *  - RTT : solde acquis / pris / restant.
 *  - Récupération d'heures supplémentaires : solde en heures.
 *  - Compteur HS-Abs semestriel (heures sup cumulées − heures d'absence),
 *    repris de l'Excel d'origine.
 *
 * « Pris » et « heures d'absence » sont DÉRIVABLES du planning (absences déjà
 * saisies) ; seuls les soldes d'ouverture (report N-1, RTT acquis, récup
 * prise) nécessitent un stockage — branché plus tard.
 */

/* ─── Période de référence des congés payés (1er juin → 31 mai) ─────── */

export type CpPeriod = { startIso: string; endIso: string; startYear: number };

/** Période de référence CP contenant la date donnée (juin N → mai N+1). */
export function cpReferencePeriod(asOf: Date): CpPeriod {
  const month = asOf.getMonth() + 1; // 1..12
  const startYear = month >= 6 ? asOf.getFullYear() : asOf.getFullYear() - 1;
  return {
    startIso: `${startYear}-06-01`,
    endIso: `${startYear + 1}-05-31`,
    startYear,
  };
}

/**
 * Nombre de mois entamés depuis le 1er juin de la période (1..12). Sert de
 * base à l'acquisition « à ce jour » (2,5 j par mois entamé).
 */
export function monthsAccruedInPeriod(asOf: Date, startYear: number): number {
  const m = (asOf.getFullYear() - startYear) * 12 + (asOf.getMonth() + 1 - 6) + 1;
  return Math.max(0, Math.min(12, m));
}

export type CpAccrualOptions = {
  /** Jours acquis par mois (défaut 2,5 ouvrables). */
  perMonth?: number;
  /** Plafond annuel d'acquisition (défaut 30 jours = 5 semaines). */
  cap?: number;
  /** Solde d'ouverture (report de la période précédente). */
  opening?: number;
};

/** Jours de CP acquis = report + min(mois × 2,5 ; plafond). */
export function cpAccrued(
  monthsAccrued: number,
  opts: CpAccrualOptions = {}
): number {
  const perMonth = opts.perMonth ?? 2.5;
  const cap = opts.cap ?? 30;
  const opening = opts.opening ?? 0;
  return opening + Math.min(monthsAccrued * perMonth, cap);
}

/* ─── Soldes génériques (acquis / pris / restant) ───────────────────── */

export type Balance = { acquired: number; taken: number; remaining: number };

export function makeBalance(acquired: number, taken: number): Balance {
  return { acquired, taken, remaining: acquired - taken };
}

/* ─── Dérivation depuis le planning ─────────────────────────────────── */

/**
 * Nombre de JOURS distincts d'absence d'un code donné (défaut CONGE) pour un
 * employé sur une plage de dates — sert à compter les CP « pris ».
 */
export function countAbsenceDays(
  empId: string,
  dateIsos: string[],
  index: Map<string, EmployeeDayMap>,
  code: AbsenceCode = "CONGE"
): number {
  let n = 0;
  for (const d of dateIsos) {
    const day = index.get(empId)?.get(d);
    if (!day) continue;
    let has = false;
    day.forEach((e) => {
      if (e.type === ScheduleType.ABSENCE && e.absenceCode === code) has = true;
    });
    if (has) n++;
  }
  return n;
}

/**
 * Heures d'absence cumulées sur une plage (tous codes, ou filtré).
 * 1 créneau = 0,5 h.
 */
export function absenceHours(
  empId: string,
  dateIsos: string[],
  index: Map<string, EmployeeDayMap>,
  codes?: AbsenceCode[]
): number {
  let slots = 0;
  for (const d of dateIsos) {
    const day = index.get(empId)?.get(d);
    if (!day) continue;
    day.forEach((e) => {
      if (
        e.type === ScheduleType.ABSENCE &&
        (!codes || (e.absenceCode != null && codes.includes(e.absenceCode)))
      ) {
        slots++;
      }
    });
  }
  return slots * SLOT_HOURS;
}

/* ─── Compteur HS-Abs semestriel ────────────────────────────────────── */

export type Semester = { startIso: string; endIso: string; label: string };

/** Semestre civil contenant la date (1er ou 2e semestre). */
export function semesterPeriod(asOf: Date): Semester {
  const y = asOf.getFullYear();
  return asOf.getMonth() < 6
    ? { startIso: `${y}-01-01`, endIso: `${y}-06-30`, label: `1er semestre ${y}` }
    : { startIso: `${y}-07-01`, endIso: `${y}-12-31`, label: `2e semestre ${y}` };
}

/**
 * Solde HS-Abs (Excel d'origine) = heures sup cumulées − heures d'absence
 * cumulées sur le semestre. Positif = crédit d'heures sup ; négatif = les
 * absences dépassent les heures sup.
 */
export function hsAbsBalance(
  overtimeHours: number,
  absenceHoursTotal: number
): number {
  return overtimeHours - absenceHoursTotal;
}

/* ─── Vue agrégée des compteurs d'un salarié ────────────────────────── */

export type EmployeeLeaveCounters = {
  cp: Balance;
  rtt: Balance;
  /** Récupération d'heures sup, en heures. */
  recovery: { earnedHours: number; takenHours: number; remainingHours: number };
  hsAbs: {
    overtimeHours: number;
    absenceHours: number;
    /** overtime − absence. */
    balanceHours: number;
  };
};

/**
 * Assemble les compteurs d'un salarié. Les parties dérivables du planning
 * (cpTaken, absenceHours) sont passées en entrée (calculées via les helpers
 * ci-dessus sur les bonnes plages) ; les soldes stockés (opening, rtt, récup)
 * aussi. Fonction pure → facile à tester et à brancher.
 */
export function employeeLeaveCounters(input: {
  monthsAccrued: number;
  cpOpening?: number;
  cpPerMonth?: number;
  cpCap?: number;
  cpTaken: number;
  rttAcquired: number;
  rttTaken: number;
  recoveryEarnedHours: number;
  recoveryTakenHours: number;
  overtimeHours: number;
  absenceHours: number;
}): EmployeeLeaveCounters {
  const cpAcq = cpAccrued(input.monthsAccrued, {
    opening: input.cpOpening,
    perMonth: input.cpPerMonth,
    cap: input.cpCap,
  });
  return {
    cp: makeBalance(cpAcq, input.cpTaken),
    rtt: makeBalance(input.rttAcquired, input.rttTaken),
    recovery: {
      earnedHours: input.recoveryEarnedHours,
      takenHours: input.recoveryTakenHours,
      remainingHours: input.recoveryEarnedHours - input.recoveryTakenHours,
    },
    hsAbs: {
      overtimeHours: input.overtimeHours,
      absenceHours: input.absenceHours,
      balanceHours: hsAbsBalance(input.overtimeHours, input.absenceHours),
    },
  };
}
