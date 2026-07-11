/**
 * Données de référence DATÉES pour la rémunération en pharmacie d'officine.
 *
 * ⚠️ Pourquoi « datées » : le SMIC et la valeur du point conventionnel
 * changent dans le temps (accords de branche, revalorisations SMIC). Chaque
 * valeur porte donc une `effectiveFrom` (date d'effet). Les helpers ci-dessous
 * renvoient TOUJOURS la valeur applicable au mois demandé → un calcul de paie
 * de janvier reste juste même après une revalo de juin.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMMENT METTRE À JOUR (quand un nouvel accord / SMIC paraît) :
 *   1. Ajouter une ligne `{ from: "AAAA-MM-JJ", value: … }` dans la table
 *      concernée (SMIC_HISTORY / POINT_HISTORY). NE PAS supprimer les
 *      anciennes : elles servent au recalcul des mois passés.
 *   2. Mettre à jour `REFERENCE_META.lastReviewed`.
 *   3. Si la grille de coefficients change (nouvelle classification),
 *      ajuster COEFFICIENT_GRID.
 * Les tables sont triées par date croissante ; les helpers prennent la
 * dernière entrée dont `from <= mois`.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Sources (vérifiées juin 2026) :
 *  - SMIC : Légifrance / Insee / Urssaf — revalo 01/01/2026 (12,02 €) et
 *    01/06/2026 (12,31 €).
 *  - Valeur du point pharmacie d'officine (IDCC 1996) : Accord du 10 mars 2025
 *    (5,215 €) puis nouvelle classification au 01/11/2025 (5,278 €), arrêté
 *    d'extension du 17/04/2026.
 *  - Salaires moyens observés & écarts régionaux : team-officine, ClubOfficine,
 *    Hellowork (ordres de grandeur indicatifs, marché 2025-2026).
 */

import type { EmployeeStatus } from "@prisma/client";

export const REFERENCE_META = {
  /** Dernière revue manuelle des données ci-dessous. */
  lastReviewed: "2026-06-30",
  conventionName: "Convention collective Pharmacie d'officine (IDCC 1996)",
  sources: [
    "Légifrance (accords de branche)",
    "Insee / Urssaf (SMIC)",
    "team-officine, ClubOfficine (marché)",
  ],
  /** Base mensualisée légale pour un temps plein 35h. */
  monthlyHoursFullTime: 151.67,
} as const;

/* ─── SMIC horaire brut, daté ──────────────────────────────────────── */
type DatedValue = { from: string; value: number };

export const SMIC_HOURLY_HISTORY: DatedValue[] = [
  { from: "2024-11-01", value: 11.88 },
  { from: "2026-01-01", value: 12.02 },
  { from: "2026-06-01", value: 12.31 },
];

/* ─── Valeur du point conventionnel, datée ─────────────────────────── */
export const POINT_VALUE_HISTORY: DatedValue[] = [
  { from: "2024-01-01", value: 5.158 }, // historique (ordre de grandeur)
  { from: "2025-03-10", value: 5.215 }, // Accord du 10 mars 2025
  { from: "2025-11-01", value: 5.278 }, // Nouvelle classification (ext. 17/04/2026)
];

/** Renvoie la dernière valeur datée applicable au mois (YYYY-MM ou Date). */
function valueAt(history: DatedValue[], month: string | Date): number {
  const iso =
    typeof month === "string"
      ? `${month}-01`.slice(0, 10)
      : `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
  let chosen = history[0].value;
  for (const entry of history) {
    if (entry.from <= iso) chosen = entry.value;
    else break;
  }
  return chosen;
}

export function smicHourlyAt(month: string | Date): number {
  return valueAt(SMIC_HOURLY_HISTORY, month);
}
export function smicMonthlyAt(month: string | Date): number {
  return round2(smicHourlyAt(month) * REFERENCE_META.monthlyHoursFullTime);
}
export function pointValueAt(month: string | Date): number {
  return valueAt(POINT_VALUE_HISTORY, month);
}

/* ─── Grille de coefficients par métier + progression d'ancienneté ──── */
/**
 * Pour chaque statut, l'échelon attendu en fonction de l'ancienneté (en
 * années). On prend le dernier seuil `minYears <= ancienneté`. Ces grilles
 * suivent la classification pharmacie d'officine (entrée préparateur 250,
 * pharmacien adjoint 470→500 à 1 an, employés 100-220). Les paliers
 * intermédiaires sont des approximations raisonnables de la grille de branche
 * (utilisées pour estimer un coefficient « attendu » sans le saisir à la main).
 */
type Echelon = { minYears: number; coefficient: number; label: string };

export const COEFFICIENT_GRID: Record<EmployeeStatus, Echelon[]> = {
  PHARMACIEN: [
    { minYears: 0, coefficient: 470, label: "Adjoint débutant" },
    { minYears: 1, coefficient: 500, label: "Adjoint ≥ 1 an" },
    { minYears: 8, coefficient: 520, label: "Adjoint confirmé" },
    { minYears: 19, coefficient: 550, label: "Adjoint ancienneté" },
  ],
  TITULAIRE: [
    // Le titulaire est en général non salarié (revenus = bénéfices de
    // l'officine). On le rattache à la grille pharmacien à titre indicatif.
    { minYears: 0, coefficient: 500, label: "Titulaire (réf. pharmacien)" },
  ],
  PREPARATEUR: [
    { minYears: 0, coefficient: 250, label: "Préparateur débutant" },
    { minYears: 2, coefficient: 260, label: "2ᵉ année" },
    { minYears: 3, coefficient: 270, label: "3ᵉ année" },
    { minYears: 6, coefficient: 290, label: "Confirmé" },
    { minYears: 12, coefficient: 310, label: "Expérimenté" },
    { minYears: 18, coefficient: 330, label: "Ancienneté" },
  ],
  ETUDIANT: [
    { minYears: 0, coefficient: 230, label: "Étudiant" },
    { minYears: 2, coefficient: 260, label: "Étudiant avancé" },
    { minYears: 4, coefficient: 300, label: "Étudiant fin de cursus" },
  ],
  SECRETAIRE: [
    { minYears: 0, coefficient: 160, label: "Secrétaire" },
    { minYears: 5, coefficient: 185, label: "Secrétaire confirmée" },
    { minYears: 12, coefficient: 220, label: "Secrétaire ancienneté" },
  ],
  BACK_OFFICE: [
    { minYears: 0, coefficient: 150, label: "Employé back-office" },
    { minYears: 5, coefficient: 175, label: "Confirmé" },
    { minYears: 12, coefficient: 200, label: "Ancienneté" },
  ],
  LIVREUR: [
    { minYears: 0, coefficient: 140, label: "Livreur / rayonniste" },
    { minYears: 5, coefficient: 160, label: "Confirmé" },
    { minYears: 12, coefficient: 185, label: "Ancienneté" },
  ],
};

/** Coefficient attendu pour un statut + une ancienneté (années). */
export function expectedCoefficient(
  status: EmployeeStatus,
  seniorityYears: number
): Echelon {
  const grid = COEFFICIENT_GRID[status];
  let chosen = grid[0];
  for (const e of grid) {
    if (seniorityYears >= e.minYears) chosen = e;
    else break;
  }
  return chosen;
}

/**
 * Minimum conventionnel HORAIRE brut pour un coefficient à une date donnée.
 * Plancher = SMIC (la convention ne peut pas descendre sous le SMIC, ce qui
 * explique que les petits coefficients soient calés sur le SMIC).
 */
function conventionalMinHourlyRaw(coefficient: number, month: string | Date): number {
  const point = pointValueAt(month);
  const fromGrid = (coefficient * point) / 100;
  return Math.max(fromGrid, smicHourlyAt(month));
}

export function conventionalMinHourly(
  coefficient: number,
  month: string | Date
): number {
  return round2(conventionalMinHourlyRaw(coefficient, month));
}

/**
 * Minimum conventionnel MENSUEL brut (temps plein 35h) pour un coefficient.
 * Calculé sur l'horaire NON arrondi pour tomber sur les montants officiels
 * (ex. coeff 250 @ point 5,215 → 1977,40 €).
 */
export function conventionalMinMonthly(
  coefficient: number,
  month: string | Date
): number {
  return round2(
    conventionalMinHourlyRaw(coefficient, month) * REFERENCE_META.monthlyHoursFullTime
  );
}

/* ─── Salaires moyens observés sur le marché (indicatifs) ───────────── */
/**
 * Brut MENSUEL moyen observé (temps plein, national) par métier — ordres de
 * grandeur marché 2025-2026, à des fins de comparaison (pas une norme légale).
 * `null` = pas de référence salariée pertinente (titulaire non salarié).
 */
export const SECTOR_AVERAGE_MONTHLY: Record<EmployeeStatus, number | null> = {
  PHARMACIEN: 4000,
  TITULAIRE: null,
  PREPARATEUR: 2250,
  ETUDIANT: 1950,
  SECRETAIRE: 2050,
  BACK_OFFICE: 2000,
  LIVREUR: 1900,
};

/* ─── Zones de référence régionales (indicatives) ───────────────────
   Régions administratives françaises + Outre-mer, plus quelques tiers
   « génériques » (grande métropole / province / rural) pour qui ne veut pas
   préciser sa région. Les écarts sont des ORDRES DE GRANDEUR du marché officine
   (coût de la vie / tension salariale), pas une norme légale. REGION_ORDER est
   la source UNIQUE (UI + validation). */
export const REGION_ORDER = [
  "NATIONAL",
  "IDF",
  "AURA",
  "BOURGOGNE_FRANCHE_COMTE",
  "BRETAGNE",
  "CENTRE_VAL_DE_LOIRE",
  "CORSE",
  "GRAND_EST",
  "HAUTS_DE_FRANCE",
  "NORMANDIE",
  "NOUVELLE_AQUITAINE",
  "OCCITANIE",
  "PAYS_DE_LA_LOIRE",
  "PACA",
  "OUTRE_MER",
  "GRANDE_METROPOLE",
  "PROVINCE",
  "RURAL",
] as const;

export type Region = (typeof REGION_ORDER)[number];

export const REGION_LABELS: Record<Region, string> = {
  NATIONAL: "National (moyenne France)",
  IDF: "Île-de-France",
  AURA: "Auvergne-Rhône-Alpes",
  BOURGOGNE_FRANCHE_COMTE: "Bourgogne-Franche-Comté",
  BRETAGNE: "Bretagne",
  CENTRE_VAL_DE_LOIRE: "Centre-Val de Loire",
  CORSE: "Corse",
  GRAND_EST: "Grand Est",
  HAUTS_DE_FRANCE: "Hauts-de-France",
  NORMANDIE: "Normandie",
  NOUVELLE_AQUITAINE: "Nouvelle-Aquitaine",
  OCCITANIE: "Occitanie",
  PAYS_DE_LA_LOIRE: "Pays de la Loire",
  PACA: "Provence-Alpes-Côte d'Azur",
  OUTRE_MER: "Outre-mer (DROM)",
  GRANDE_METROPOLE: "Grande métropole (générique)",
  PROVINCE: "Province (générique)",
  RURAL: "Zone rurale (générique)",
};

/** Écart régional indicatif sur les salaires d'officine (ordre de grandeur
 *  marché / coût de la vie ; base 1,00 = moyenne nationale). */
export const REGION_MULTIPLIER: Record<Region, number> = {
  NATIONAL: 1.0,
  IDF: 1.12, // Paris/IDF : +10 à 15 % vs moyenne nationale
  AURA: 1.04, // Auvergne-Rhône-Alpes (Lyon)
  BOURGOGNE_FRANCHE_COMTE: 0.97,
  BRETAGNE: 0.99,
  CENTRE_VAL_DE_LOIRE: 0.99,
  CORSE: 1.06, // Coût de la vie insulaire
  GRAND_EST: 0.99,
  HAUTS_DE_FRANCE: 0.98,
  NORMANDIE: 0.98,
  NOUVELLE_AQUITAINE: 1.0, // Bordeaux
  OCCITANIE: 1.0, // Toulouse / Montpellier
  PAYS_DE_LA_LOIRE: 1.0, // Nantes
  PACA: 1.05, // Marseille / Nice / Côte d'Azur
  OUTRE_MER: 1.1, // DROM — majoration vie chère
  GRANDE_METROPOLE: 1.04,
  PROVINCE: 0.98,
  RURAL: 0.96,
};

/** Moyenne marché MENSUELLE ajustée région (null si non salarié). */
export function sectorAverageMonthly(
  status: EmployeeStatus,
  region: Region
): number | null {
  const base = SECTOR_AVERAGE_MONTHLY[status];
  if (base == null) return null;
  return round2(base * REGION_MULTIPLIER[region]);
}

/** Moyenne marché HORAIRE ajustée région (null si non salarié). */
export function sectorAverageHourly(
  status: EmployeeStatus,
  region: Region
): number | null {
  const monthly = sectorAverageMonthly(status, region);
  if (monthly == null) return null;
  return round2(monthly / REFERENCE_META.monthlyHoursFullTime);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
