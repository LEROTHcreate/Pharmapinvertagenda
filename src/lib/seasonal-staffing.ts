/**
 * Prévision saisonnière d'effectif — pics d'activité connus en officine
 * française. Pure fonction (testable, sans React). Alimente les tips du
 * bandeau planning au même titre que les ponts / veilles de fériés.
 *
 * Les périodes sont définies par bornes mois-jour ("MM-DD") et peuvent
 * enjamber le 31/12 (ex. épidémies hivernales déc → fév). Tout est calculé
 * en UTC pour rester déterministe quelle que soit la TZ serveur.
 */

import type { PlanningTip } from "@/lib/planning-tips";

type SeasonalPeriod = {
  key: string;
  /** Bornes incluses, format "MM-DD". start > end ⇒ période qui enjambe l'année. */
  start: string;
  end: string;
  level: "info" | "warning";
  title: string;
  advice: string;
};

/**
 * Calendrier des pics d'activité officine (France). Ordre = priorité
 * d'affichage quand plusieurs se chevauchent (les plus impactants d'abord).
 */
export const SEASONAL_PERIODS: SeasonalPeriod[] = [
  {
    key: "winter-epidemic",
    start: "12-01",
    // 02-29 (et non 02-28) pour inclure le 29 février des années bissextiles —
    // sans effet les années normales (la date n'existe pas, comparaison MM-DD).
    end: "02-29",
    level: "warning",
    title: "Épidémies hivernales",
    advice:
      "Grippe, gastro, bronchiolite : pic de fréquentation au comptoir et en délivrance. Renforcez l'effectif, surtout lundi et samedi.",
  },
  {
    key: "flu-vaccine",
    start: "10-15",
    end: "01-31",
    level: "info",
    title: "Campagne vaccination grippe",
    advice:
      "Forte demande de vaccination antigrippale. Prévoyez des créneaux dédiés et des personnes habilitées sur le planning.",
  },
  {
    key: "summer-leave",
    start: "07-01",
    end: "08-31",
    level: "warning",
    title: "Été — congés & tourisme",
    advice:
      "Équipe souvent réduite (congés) et affluence touristique selon la zone. Anticipez la couverture des créneaux d'ouverture.",
  },
  {
    key: "back-to-school",
    start: "08-25",
    end: "09-15",
    level: "info",
    title: "Rentrée scolaire",
    advice:
      "Ordonnances de rentrée, vaccins de rappel et certificats : pic d'affluence début septembre.",
  },
  {
    key: "allergies",
    start: "03-15",
    end: "06-30",
    level: "info",
    title: "Saison des allergies (pollens)",
    advice:
      "Hausse des demandes d'antihistaminiques et de conseil. Un léger renfort conseil peut être utile aux heures de pointe.",
  },
  {
    key: "year-end",
    start: "12-15",
    end: "12-31",
    level: "info",
    title: "Fêtes de fin d'année",
    advice:
      "Affluence avant les fermetures et renouvellements d'ordonnances en avance. Vérifiez la couverture autour des jours fériés.",
  },
];

function parseUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function mmdd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

/** Vrai si `md` (MM-DD) est dans [start, end], bornes incluses, year-wrap géré. */
function inRange(md: string, start: string, end: string): boolean {
  if (start <= end) return md >= start && md <= end;
  // Période qui enjambe le 31/12 (ex. 12-01 → 02-28)
  return md >= start || md <= end;
}

/** Nombre de jours (≥0) entre `fromIso` et la prochaine occurrence de `startMMDD`. */
function daysUntilStart(fromIso: string, startMMDD: string): number {
  const from = parseUtc(fromIso);
  const [m, d] = startMMDD.split("-").map(Number);
  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    const candidate = new Date(
      Date.UTC(from.getUTCFullYear() + yearOffset, m - 1, d)
    );
    const diff = Math.round((candidate.getTime() - from.getTime()) / 86400000);
    if (diff >= 0) return diff;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Tips saisonniers pour la date donnée : les périodes ACTIVES + celles qui
 * démarrent dans les `horizonDays` prochains jours ("approche").
 */
export function seasonalTips(
  fromIso: string,
  horizonDays = 21
): PlanningTip[] {
  const md = mmdd(parseUtc(fromIso));
  const out: PlanningTip[] = [];

  for (const p of SEASONAL_PERIODS) {
    if (inRange(md, p.start, p.end)) {
      out.push({
        date: fromIso,
        level: p.level,
        title: p.title,
        description: p.advice,
      });
      continue;
    }
    const until = daysUntilStart(fromIso, p.start);
    if (until > 0 && until <= horizonDays) {
      out.push({
        date: fromIso,
        level: "info",
        title: `${p.title} — bientôt`,
        description: `Dans ~${until} j : ${p.advice}`,
      });
    }
  }

  return out;
}
