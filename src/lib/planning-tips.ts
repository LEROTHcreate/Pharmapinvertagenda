/**
 * Tips contextuels affichés dans le bandeau du planning (icône étoile à
 * droite). Pure fonction côté serveur — pas de dépendance React, testable.
 *
 * Règles métier :
 *  - **Reprise après pont** : un jour ouvré (lun-sam) précédé d'au moins 2
 *    jours non travaillés consécutifs (week-end + férié(s)) → affluence
 *    probable au comptoir, on prévient l'équipe.
 *  - **Veille de férié** : flux soutenu en fin de journée (renouvellements
 *    d'ordonnance en avance).
 *
 * Toutes les dates sont en UTC pour rester déterministes (le serveur tourne
 * potentiellement dans une autre TZ que le client).
 */

import { holidayForDate } from "@/lib/holidays-fr";

export type PlanningTip = {
  /** Date ISO (YYYY-MM-DD) — le jour concerné par le tip. */
  date: string;
  level: "info" | "warning";
  title: string;
  description: string;
};

function parseUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function isoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function formatDateFR(iso: string): string {
  return parseUtc(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * Vrai si la pharmacie est ouverte ce jour-là.
 * Hypothèse : ouverture lun-sam (1..6 UTC), dim fermé, jours fériés fermés.
 */
export function isWorkingDay(iso: string): boolean {
  const d = parseUtc(iso);
  const dow = d.getUTCDay(); // 0=dim, 6=sam
  if (dow === 0) return false;
  if (holidayForDate(iso)) return false;
  return true;
}

/**
 * Compte le nombre de jours non travaillés CONSÉCUTIFS qui précèdent `iso`
 * (sans compter `iso` lui-même). Plafond à 10 pour rester sûr.
 */
export function consecutiveNonWorkingBefore(iso: string): number {
  let count = 0;
  let d = parseUtc(iso);
  for (let i = 0; i < 10; i++) {
    d = addDaysUtc(d, -1);
    if (!isWorkingDay(isoUtc(d))) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/** Renvoie le tip pour ce jour-là, ou null si rien à signaler. */
export function tipFor(iso: string): PlanningTip | null {
  // 1. Veille d'un férié → flux ordonnances en avance
  const tomorrow = isoUtc(addDaysUtc(parseUtc(iso), 1));
  const tomorrowHoliday = holidayForDate(tomorrow);
  if (tomorrowHoliday && isWorkingDay(iso)) {
    return {
      date: iso,
      level: "info",
      title: `Veille de ${tomorrowHoliday.name}`,
      description: `${formatDateFR(iso)} — flux soutenu attendu (renouvellements d'ordonnances en avance).`,
    };
  }

  // 2. Reprise après ≥2 jours non travaillés (= au moins un week-end +
  //    un férié, ou un pont de plusieurs jours)
  if (!isWorkingDay(iso)) return null;
  const before = consecutiveNonWorkingBefore(iso);
  if (before >= 2) {
    const label =
      before === 2
        ? "week-end"
        : before === 3
          ? "pont de 3 jours"
          : `pont de ${before} jours`;
    return {
      date: iso,
      level: "info",
      title: `Reprise après ${label}`,
      description: `${formatDateFR(iso)} — affluence probable au comptoir. Prévoyez du staffing.`,
    };
  }

  return null;
}

/**
 * Renvoie tous les tips pour les `lookAheadDays` jours à venir (à partir de
 * `fromIso` inclus). Utilisé par /planning pour le badge étoile.
 */
export function upcomingTips(
  fromIso: string,
  lookAheadDays = 7
): PlanningTip[] {
  const start = parseUtc(fromIso);
  const out: PlanningTip[] = [];
  for (let i = 0; i < lookAheadDays; i++) {
    const iso = isoUtc(addDaysUtc(start, i));
    const tip = tipFor(iso);
    if (tip) out.push(tip);
  }
  return out;
}
