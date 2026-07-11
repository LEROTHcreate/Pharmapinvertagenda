import type { EmployeeStatus } from "@prisma/client";

/**
 * Compteur INDICATIF de congés payés (CP) — visible titulaire uniquement.
 *
 * Règle : 2,5 jours ouvrables acquis par mois travaillé (30 j/an, 5 semaines).
 * Solde = solde de référence saisi (base) + acquis depuis la date de base −
 * jours de congé pris depuis cette date. La base permet de partir du vrai solde
 * à l'adoption de l'app (les CP pris avant ne sont pas enregistrés).
 *
 * ⚠ Estimation de gestion, pas un décompte légal : la période d'acquisition/
 * prise (1er juin → 31 mai) et les jours ouvrables exacts ne sont pas modélisés
 * finement. À afficher comme tel.
 */

export const CP_PER_MONTH = 2.5;
/** Au-delà de ce solde (jours), on alerte « solde élevé à écouler ». */
export const CP_HIGH_THRESHOLD = 24;

const AVG_DAYS_PER_MONTH = 30.4375;

export type CpEmployeeInput = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  displayColor: string;
  hireDate: Date | null;
  cpBalanceBase: number | null;
  cpBalanceBaseDate: Date | null;
};

export type CpBalance = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  displayColor: string;
  /** Solde de référence (jours) retenu comme point de départ. */
  base: number;
  /** Date de référence (ISO) — base de date connue, sinon embauche. */
  baseDate: string | null;
  /** CP acquis depuis la date de base (2,5 j/mois). */
  acquired: number;
  /** Jours de congé pris depuis la date de base. */
  taken: number;
  /** Solde restant estimé = base + acquis − pris. */
  remaining: number;
  /** Solde élevé (≥ seuil) → à écouler. */
  high: boolean;
  /** Un solde de référence a-t-il été saisi ? (sinon estimation moins fiable) */
  hasBase: boolean;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Nombre de mois (fractionnaires) écoulés entre deux dates (min 0). */
export function monthsElapsed(from: Date, to: Date): number {
  const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, days / AVG_DAYS_PER_MONTH);
}

/**
 * Calcule le solde CP par salarié.
 * @param congeDatesByEmp  dates ISO DISTINCTES de congé (type CONGE) par salarié.
 */
export function computeCpBalances(
  employees: CpEmployeeInput[],
  congeDatesByEmp: Map<string, string[]>,
  now: Date
): CpBalance[] {
  return employees.map((e) => {
    const baseDate = e.cpBalanceBaseDate ?? e.hireDate ?? null;
    const baseIso = baseDate ? toIso(baseDate) : null;
    const base = e.cpBalanceBase ?? 0;
    const acquired = baseDate ? r1(monthsElapsed(baseDate, now) * CP_PER_MONTH) : 0;
    const dates = congeDatesByEmp.get(e.id) ?? [];
    // Jours de congé pris à partir de la date de base.
    const taken = baseIso
      ? dates.filter((d) => d >= baseIso).length
      : dates.length;
    const remaining = r1(base + acquired - taken);
    return {
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      status: e.status,
      displayColor: e.displayColor,
      base,
      baseDate: baseIso,
      acquired,
      taken,
      remaining,
      high: remaining >= CP_HIGH_THRESHOLD,
      hasBase: e.cpBalanceBase != null,
    };
  });
}
