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

/**
 * Indique si `iso` est une "grosse journée" (affluence comptoir élevée),
 * indépendamment de l'effectif planifié. Utilisé par l'analyse de couverture
 * pour escalader une alerte si l'effectif est faible ce jour-là.
 *
 * Sont considérés comme grosses journées (officine ouverte) :
 *  - **Lendemain de férié** (rattrapage du jour fermé), même isolé.
 *  - **Reprise après un pont** (≥2 jours fermés d'affilée avant).
 *  - **Lundi** (reprise post-weekend, classique en pharmacie).
 *  - **Samedi** (clients en repos).
 */
export function isHeavyDay(iso: string): { reason: string } | null {
  if (!isWorkingDay(iso)) return null;
  const before = consecutiveNonWorkingBefore(iso);
  const yesterday = isoUtc(addDaysUtc(parseUtc(iso), -1));
  const yHoliday = holidayForDate(yesterday);

  if (before >= 2) return { reason: "reprise après plusieurs jours fermés" };
  if (yHoliday) return { reason: `lendemain de ${yHoliday.name}` };

  const dow = parseUtc(iso).getUTCDay();
  if (dow === 1) return { reason: "lundi" };
  if (dow === 6) return { reason: "samedi" };
  return null;
}

/** Renvoie le tip pour ce jour-là, ou null si rien à signaler. */
export function tipFor(iso: string): PlanningTip | null {
  // 1. Veille d'un férié → flux ordonnances en avance (soir chargé)
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

  if (!isWorkingDay(iso)) return null;
  const before = consecutiveNonWorkingBefore(iso);

  // 2. Reprise après ≥2 jours non travaillés (week-end + férié, ou pont)
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

  // 3. Lendemain de férié ISOLÉ (hier = férié, mais pas un pont ≥2)
  const yesterday = isoUtc(addDaysUtc(parseUtc(iso), -1));
  const yHoliday = holidayForDate(yesterday);
  if (yHoliday) {
    return {
      date: iso,
      level: "info",
      title: `Lendemain de ${yHoliday.name}`,
      description: `${formatDateFR(iso)} — affluence (rattrapage du jour fermé). Prévoyez du staffing.`,
    };
  }

  // 4. Lundi / Samedi — grosses journées récurrentes
  const dow = parseUtc(iso).getUTCDay();
  if (dow === 1) {
    return {
      date: iso,
      level: "info",
      title: "Lundi — grosse journée",
      description: `${formatDateFR(iso)} — comptoir chargé (reprise post-weekend). Attention à l'effectif : un absent se ressent vite.`,
    };
  }
  if (dow === 6) {
    return {
      date: iso,
      level: "info",
      title: "Samedi — grosse journée",
      description: `${formatDateFR(iso)} — affluence (clients en repos). Attention à l'effectif.`,
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
