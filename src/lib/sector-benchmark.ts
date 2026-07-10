/**
 * Repères sectoriels « officine » — fourchettes INDICATIVES pour comparer les
 * ratios de gestion d'une pharmacie à son marché. Volontairement présentées
 * comme des ordres de grandeur (non contractuelles) : le but est de situer
 * l'officine (« dans la norme / à surveiller / bien placé »), pas de produire
 * un chiffre officiel.
 *
 * Pour mettre à jour : ajuster les seuils ci-dessous + `SECTOR_META.lastReviewed`.
 */

export const SECTOR_META = {
  lastReviewed: "2026-06-30",
  disclaimer:
    "Fourchettes indicatives du secteur de l'officine (ordres de grandeur, non contractuels).",
  sources: [
    "Observatoires de branche pharmacie d'officine",
    "Insee — commerce de détail",
    "Baromètres nationaux de l'absentéisme",
  ],
} as const;

export type BenchDirection = "lower-is-better" | "higher-is-better";
export type BenchUnit = "pct" | "eur";

export type SectorBand = {
  /** Libellé lisible de l'indicateur. */
  label: string;
  unit: BenchUnit;
  direction: BenchDirection;
  /** Repère central du secteur (médiane approx.). */
  median: number;
  /** Valeur clairement FAVORABLE (seuil « bien placé »). */
  favorableAt: number;
  /** Valeur clairement à SURVEILLER (seuil d'alerte). */
  alertAt: number;
  /** Explication courte affichée en légende. */
  note: string;
};

/**
 * Table des repères. Les seuils sont des estimations raisonnables du secteur
 * officine (à affiner avec les observatoires de branche).
 */
export const SECTOR_BANDS = {
  /** Coût employeur total rapporté au CA HT. Plus c'est bas, mieux c'est. */
  payrollToRevenue: {
    label: "Masse salariale / CA HT",
    unit: "pct",
    direction: "lower-is-better",
    median: 0.13,
    favorableAt: 0.115,
    alertAt: 0.15,
    note: "Coût employeur total ÷ chiffre d'affaires HT. En officine, ~11–15 % selon la taille et l'automatisation.",
  },
  /** Taux d'absentéisme subi (maladie + absences injustifiées). Bas = mieux. */
  absenteeism: {
    label: "Absentéisme",
    unit: "pct",
    direction: "lower-is-better",
    median: 0.05,
    favorableAt: 0.035,
    alertAt: 0.07,
    note: "Maladie + absences injustifiées ÷ heures totales. Moyenne nationale ~5 %.",
  },
  /** Chiffre d'affaires HT annualisé par ETP. Plus haut = plus productif. */
  revenuePerFte: {
    label: "Productivité (CA HT / ETP)",
    unit: "eur",
    direction: "higher-is-better",
    median: 240_000,
    favorableAt: 285_000,
    alertAt: 190_000,
    note: "CA HT annualisé ÷ équivalent temps plein. Ordre de grandeur officine ~230–260 k€/ETP.",
  },
  /** Part des heures sup dans les heures travaillées. Bas = mieux (repère de gestion). */
  overtimeShare: {
    label: "Intensité des heures sup",
    unit: "pct",
    direction: "lower-is-better",
    median: 0.03,
    favorableAt: 0.02,
    alertAt: 0.05,
    note: "Heures sup ÷ heures travaillées. Repère de gestion : au-delà de ~5 %, contractualiser les heures récurrentes.",
  },
} satisfies Record<string, SectorBand>;

export type SectorKey = keyof typeof SECTOR_BANDS;

export type BenchVerdict = "good" | "normal" | "watch";

export type BenchResult = {
  verdict: BenchVerdict;
  /** Libellé court du positionnement. */
  label: string;
  /** Écart signé à la médiane secteur (même unité que la valeur). */
  deltaToMedian: number;
  band: SectorBand;
};

/**
 * Situe une valeur par rapport à la fourchette sectorielle.
 * - lower-is-better : ≤ favorableAt = bien placé ; ≥ alertAt = à surveiller.
 * - higher-is-better : ≥ favorableAt = bien placé ; ≤ alertAt = à surveiller.
 */
export function classifySector(value: number, key: SectorKey): BenchResult {
  const band = SECTOR_BANDS[key];
  let verdict: BenchVerdict = "normal";
  if (band.direction === "lower-is-better") {
    if (value <= band.favorableAt) verdict = "good";
    else if (value >= band.alertAt) verdict = "watch";
  } else {
    if (value >= band.favorableAt) verdict = "good";
    else if (value <= band.alertAt) verdict = "watch";
  }
  const label =
    verdict === "good"
      ? "Bien placé"
      : verdict === "watch"
        ? "À surveiller"
        : "Dans la norme";
  return { verdict, label, deltaToMedian: value - band.median, band };
}
