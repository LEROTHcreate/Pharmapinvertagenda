import { SLOT_HOURS } from "@/types";

/**
 * Base PARTAGÉE de calcul des heures de travail — source unique pour le module
 * Statistiques ET le module Rémunération.
 *
 * Objectif : ces deux modules doivent TOUJOURS parler des mêmes heures. Avant,
 * la logique (durée d'un créneau, début de semaine ISO, répartition des heures
 * supplémentaires) était dupliquée dans `stats.ts` et `payroll-calc.ts` — un
 * changement d'un côté aurait fait diverger les chiffres. Tout est centralisé
 * ici pour verrouiller la cohérence.
 */

// Durée d'un créneau : 30 min = 0,5 h. Ré-exporté pour un import unique.
export { SLOT_HOURS };

/**
 * Lundi de la semaine ISO (en UTC) contenant la date donnée. L'officine étant
 * fermée le dimanche, on aligne la semaine sur le lundi (jour 1).
 */
export function isoWeekStartUTC(d: Date): Date {
  const day = d.getUTCDay(); // 0=dim, 1=lun…6=sam
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  start.setUTCDate(start.getUTCDate() + diff);
  return start;
}

/**
 * Clé de semaine ISO ("YYYY-MM-DD" du lundi) pour une date "YYYY-MM-DD".
 * Construite sur `isoWeekStartUTC` → une seule définition du début de semaine.
 */
export function isoWeekKey(dateIso: string): string {
  return isoWeekStartUTC(new Date(`${dateIso}T00:00:00Z`))
    .toISOString()
    .slice(0, 10);
}

/** Répartition des heures supplémentaires d'UNE semaine. */
export type OvertimeSplit = {
  /** Total des heures au-delà du contrat hebdomadaire. */
  total: number;
  /** Heures majorées à +25 % (les 8 premières au-delà du contrat). */
  h25: number;
  /** Heures majorées à +50 % (au-delà des 8 premières). */
  h50: number;
};

/**
 * Heures supplémentaires d'une semaine, réparties selon l'Art. L3121-28 du Code
 * du travail : +25 % pour les 8 premières heures au-delà du contrat, +50 %
 * au-delà. Le calcul se fait SEMAINE par semaine (pas au mois).
 *
 * @param weekWorkedHours heures TÂCHE réellement travaillées dans la semaine
 * @param weeklyContractHours durée contractuelle hebdomadaire du salarié
 */
export function weeklyOvertimeSplit(
  weekWorkedHours: number,
  weeklyContractHours: number
): OvertimeSplit {
  const total = Math.max(0, weekWorkedHours - weeklyContractHours);
  const h25 = Math.min(total, 8);
  const h50 = Math.max(0, total - 8);
  return { total, h25, h50 };
}