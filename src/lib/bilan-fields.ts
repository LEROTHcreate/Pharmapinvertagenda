/**
 * Référentiel des postes financiers d'un « Bilan » (compte de résultat +
 * soldes intermédiaires de gestion + bilan) + calcul des ratios clés d'une
 * officine. Sert à la saisie, à l'extraction (prompt) et à l'analyse.
 *
 * On stocke DEUX jeux de valeurs : l'exercice N et l'exercice N-1, pour étudier
 * l'évolution (le cœur d'une analyse de bilan).
 */

export type BilanFieldKey =
  // Activité & marges (soldes intermédiaires de gestion)
  | "chiffreAffaires"
  | "ventesMarchandises"
  | "achatsMarchandises"
  | "margeCommerciale"
  | "valeurAjoutee"
  | "chargesExternes"
  | "chargesPersonnel"
  | "remunerationDirigeants"
  | "impotsTaxes"
  | "ebe"
  // Résultat
  | "dotationsAmortissements"
  | "resultatExploitation"
  | "resultatFinancier"
  | "resultatCourant"
  | "resultatExceptionnel"
  | "impotSocietes"
  | "resultatNet"
  // Bilan — Actif
  | "fondsCommercial"
  | "actifImmobilise"
  | "stocks"
  | "creancesClients"
  | "valeursMobilieresPlacement"
  | "tresorerie"
  | "totalActif"
  // Bilan — Passif
  | "capitauxPropres"
  | "dettesFinancieres"
  | "dettesFournisseurs"
  | "dettesFiscalesSociales"
  | "totalPassif";

export type BilanGroup =
  | "Activité & marges"
  | "Résultat"
  | "Bilan — Actif"
  | "Bilan — Passif";

export type BilanField = {
  key: BilanFieldKey;
  label: string;
  group: BilanGroup;
  hint?: string;
};

export const BILAN_FIELDS: BilanField[] = [
  // ─── Activité & marges ───
  { key: "chiffreAffaires", label: "Chiffre d'affaires HT", group: "Activité & marges", hint: "CA net total hors taxes de l'exercice" },
  { key: "ventesMarchandises", label: "Ventes de marchandises", group: "Activité & marges", hint: "CA marchandises (hors prestations/services)" },
  { key: "achatsMarchandises", label: "Coût d'achat des marchandises", group: "Activité & marges", hint: "Achats consommés (achats ± variation de stock)" },
  { key: "margeCommerciale", label: "Marge commerciale (brute)", group: "Activité & marges", hint: "Ventes de marchandises − coût d'achat" },
  { key: "valeurAjoutee", label: "Valeur ajoutée", group: "Activité & marges", hint: "Richesse créée après achats et charges externes" },
  { key: "chargesExternes", label: "Autres achats & charges externes", group: "Activité & marges", hint: "Loyers, leasing, énergie, honoraires, maintenance…" },
  { key: "chargesPersonnel", label: "Charges de personnel (salariés)", group: "Activité & marges", hint: "Salaires + charges sociales du personnel salarié" },
  { key: "remunerationDirigeants", label: "Rémunération des dirigeants", group: "Activité & marges", hint: "Rémunération + charges des titulaires/gérants (TNS)" },
  { key: "impotsTaxes", label: "Impôts & taxes", group: "Activité & marges" },
  { key: "ebe", label: "Excédent brut d'exploitation (EBE)", group: "Activité & marges", hint: "Marge d'exploitation avant amortissements et financier" },
  // ─── Résultat ───
  { key: "dotationsAmortissements", label: "Dotations aux amortissements", group: "Résultat" },
  { key: "resultatExploitation", label: "Résultat d'exploitation", group: "Résultat" },
  { key: "resultatFinancier", label: "Résultat financier", group: "Résultat", hint: "Produits financiers − charges financières (intérêts)" },
  { key: "resultatCourant", label: "Résultat courant avant impôt", group: "Résultat" },
  { key: "resultatExceptionnel", label: "Résultat exceptionnel", group: "Résultat" },
  { key: "impotSocietes", label: "Impôt sur les bénéfices", group: "Résultat" },
  { key: "resultatNet", label: "Résultat net", group: "Résultat", hint: "Bénéfice/perte final de l'exercice" },
  // ─── Bilan — Actif ───
  { key: "fondsCommercial", label: "Fonds commercial", group: "Bilan — Actif", hint: "Valeur du fonds de commerce (souvent le plus gros actif)" },
  { key: "actifImmobilise", label: "Actif immobilisé (total net)", group: "Bilan — Actif", hint: "Fonds, matériel, agencements, titres (net)" },
  { key: "stocks", label: "Stocks", group: "Bilan — Actif" },
  { key: "creancesClients", label: "Créances clients", group: "Bilan — Actif", hint: "Tiers payant, mutuelles à encaisser…" },
  { key: "valeursMobilieresPlacement", label: "Valeurs mobilières de placement", group: "Bilan — Actif", hint: "Placements (CAT, comptes-titres…)" },
  { key: "tresorerie", label: "Disponibilités", group: "Bilan — Actif", hint: "Banque + caisse" },
  { key: "totalActif", label: "Total actif", group: "Bilan — Actif" },
  // ─── Bilan — Passif ───
  { key: "capitauxPropres", label: "Capitaux propres", group: "Bilan — Passif", hint: "Capital + réserves + report à nouveau + résultat" },
  { key: "dettesFinancieres", label: "Dettes financières", group: "Bilan — Passif", hint: "Emprunts bancaires (dont rachat officine) + comptes associés" },
  { key: "dettesFournisseurs", label: "Dettes fournisseurs", group: "Bilan — Passif", hint: "Grossistes, laboratoires à payer" },
  { key: "dettesFiscalesSociales", label: "Dettes fiscales & sociales", group: "Bilan — Passif", hint: "URSSAF, TVA, IS à payer" },
  { key: "totalPassif", label: "Total passif", group: "Bilan — Passif" },
];

export const BILAN_GROUPS: BilanGroup[] = [
  "Activité & marges",
  "Résultat",
  "Bilan — Actif",
  "Bilan — Passif",
];

export type BilanData = Partial<Record<BilanFieldKey, number>>;

/** Un ratio calculé, avec appréciation. */
export type BilanRatio = {
  key: string;
  label: string;
  /** Valeur formatée (ex. "32 %", "1,8 mois"). */
  value: string;
  /** Valeur brute (pour tri/comparaison/tendance), null si non calculable. */
  raw: number | null;
  tone: "good" | "warning" | "bad" | "neutral";
  /** true = « plus haut c'est mieux » (sert au sens de la flèche de tendance). */
  higherIsBetter: boolean;
  hint: string;
};

const pctFmt = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
const num = (d: BilanData, k: BilanFieldKey): number | null =>
  typeof d[k] === "number" && !Number.isNaN(d[k]) ? (d[k] as number) : null;
const ratio = (a: number | null, b: number | null) =>
  a != null && b != null && b !== 0 ? a / b : null;

/**
 * Ratios clés d'une officine. Les seuils d'appréciation sont indicatifs
 * (ordres de grandeur du secteur pharmacie), pas des vérités absolues.
 */
export function computeBilanRatios(d: BilanData): BilanRatio[] {
  const ca = num(d, "chiffreAffaires");
  const ebe = num(d, "ebe");
  const rn = num(d, "resultatNet");
  const marge = num(d, "margeCommerciale");
  const va = num(d, "valeurAjoutee");
  const perso = num(d, "chargesPersonnel");
  const dirig = num(d, "remunerationDirigeants");
  const cp = num(d, "capitauxPropres");
  const tp = num(d, "totalPassif") ?? num(d, "totalActif");
  const detteFi = num(d, "dettesFinancieres");
  const treso = (num(d, "tresorerie") ?? 0) + (num(d, "valeursMobilieresPlacement") ?? 0);
  const stocks = num(d, "stocks");
  const clients = num(d, "creancesClients");
  const fourn = num(d, "dettesFournisseurs");

  const out: BilanRatio[] = [];

  const tauxMarge = ratio(marge, ca);
  out.push({
    key: "tauxMarge",
    label: "Taux de marge commerciale",
    value: tauxMarge != null ? pctFmt(tauxMarge) : "—",
    raw: tauxMarge,
    tone: tauxMarge == null ? "neutral" : tauxMarge >= 0.3 ? "good" : tauxMarge >= 0.26 ? "warning" : "bad",
    higherIsBetter: true,
    hint: "Marge commerciale / CA. Repère officine ≈ 30-33 %.",
  });

  const tauxVa = ratio(va, ca);
  out.push({
    key: "tauxVa",
    label: "Taux de valeur ajoutée",
    value: tauxVa != null ? pctFmt(tauxVa) : "—",
    raw: tauxVa,
    tone: tauxVa == null ? "neutral" : tauxVa >= 0.28 ? "good" : tauxVa >= 0.24 ? "warning" : "bad",
    higherIsBetter: true,
    hint: "Valeur ajoutée / CA. Richesse créée ; repère officine ≈ 28-32 %.",
  });

  const tauxEbe = ratio(ebe, ca);
  out.push({
    key: "tauxEbe",
    label: "Taux d'EBE (rentabilité)",
    value: tauxEbe != null ? pctFmt(tauxEbe) : "—",
    raw: tauxEbe,
    tone: tauxEbe == null ? "neutral" : tauxEbe >= 0.1 ? "good" : tauxEbe >= 0.06 ? "warning" : "bad",
    higherIsBetter: true,
    hint: "EBE / CA. Rentabilité d'exploitation ; repère sain ≥ 10 %. En officine, l'EBE retraité (avant rémunération du titulaire) est souvent la vraie mesure.",
  });

  const rentaNette = ratio(rn, ca);
  out.push({
    key: "rentaNette",
    label: "Rentabilité nette",
    value: rentaNette != null ? pctFmt(rentaNette) : "—",
    raw: rentaNette,
    tone: rentaNette == null ? "neutral" : rentaNette >= 0.05 ? "good" : rentaNette >= 0.02 ? "warning" : "bad",
    higherIsBetter: true,
    hint: "Résultat net / CA.",
  });

  // Poids du personnel TOTAL (salariés + dirigeants) — pertinent en officine.
  const persoTotal = perso != null || dirig != null ? (perso ?? 0) + (dirig ?? 0) : null;
  const poidsPerso = ratio(persoTotal, ca);
  out.push({
    key: "poidsPersonnel",
    label: "Poids du personnel / CA",
    value: poidsPerso != null ? pctFmt(poidsPerso) : "—",
    raw: poidsPerso,
    tone: poidsPerso == null ? "neutral" : poidsPerso <= 0.15 ? "good" : poidsPerso <= 0.2 ? "warning" : "bad",
    higherIsBetter: false,
    hint: "Salariés + dirigeants rapportés au CA. Repère officine ≈ 13-18 % (dirigeants inclus).",
  });

  const autonomie = ratio(cp, tp);
  out.push({
    key: "autonomie",
    label: "Autonomie financière",
    value: autonomie != null ? pctFmt(autonomie) : "—",
    raw: autonomie,
    tone: autonomie == null ? "neutral" : autonomie >= 0.3 ? "good" : autonomie >= 0.2 ? "warning" : "bad",
    higherIsBetter: true,
    hint: "Capitaux propres / total bilan. Solidité ; ≥ 30 % = confortable.",
  });

  const capRemb = ratio(detteFi, ebe);
  out.push({
    key: "capaciteRemboursement",
    label: "Capacité de remboursement",
    value: capRemb != null ? `${capRemb.toFixed(1).replace(".", ",")} ans` : "—",
    raw: capRemb,
    tone: capRemb == null ? "neutral" : capRemb < 0 ? "bad" : capRemb <= 5 ? "good" : capRemb <= 7 ? "warning" : "bad",
    higherIsBetter: false,
    hint: "Dettes financières / EBE. < 5 ans = sain (norme bancaire).",
  });

  // Trésorerie (disponibilités + VMP) en mois de charges de personnel totales.
  const persoMonthly = persoTotal && persoTotal > 0 ? persoTotal / 12 : null;
  const tresoMois = persoMonthly ? treso / persoMonthly : null;
  out.push({
    key: "tresorerie",
    label: "Coussin de trésorerie",
    value:
      tresoMois != null
        ? `${tresoMois.toFixed(1).replace(".", ",")} mois`
        : treso
          ? `${Math.round(treso).toLocaleString("fr-FR")} €`
          : "—",
    raw: tresoMois,
    tone: tresoMois == null ? "neutral" : tresoMois >= 1.5 ? "good" : tresoMois >= 0.5 ? "warning" : "bad",
    higherIsBetter: true,
    hint: "Trésorerie (disponibilités + placements) rapportée à un mois de masse salariale.",
  });

  // BFR = stocks + créances clients − dettes fournisseurs (approché).
  if (stocks != null || clients != null || fourn != null) {
    const bfr = (stocks ?? 0) + (clients ?? 0) - (fourn ?? 0);
    const bfrJours = ca && ca > 0 ? (bfr / ca) * 360 : null;
    out.push({
      key: "bfr",
      label: "Besoin en fonds de roulement",
      value:
        bfrJours != null
          ? `${Math.round(bfrJours)} j de CA`
          : `${Math.round(bfr).toLocaleString("fr-FR")} €`,
      raw: bfrJours,
      tone: bfrJours == null ? "neutral" : bfrJours <= 25 ? "good" : bfrJours <= 45 ? "warning" : "bad",
      higherIsBetter: false,
      hint: "Stocks + créances clients − dettes fournisseurs. Plus il est faible, moins l'exploitation « gèle » de trésorerie.",
    });
  }

  return out;
}

/**
 * EBE RETRAITÉ (officine) = EBE + rémunération des dirigeants (rémunération +
 * charges sociales TNS des titulaires). C'est la vraie mesure de rentabilité et
 * la base de valorisation : elle neutralise le choix de rémunération du gérant.
 * Renvoie null si l'EBE n'est pas connu.
 */
export function computeEbeRetraite(d: BilanData): number | null {
  const ebe = num(d, "ebe");
  if (ebe == null) return null;
  return ebe + (num(d, "remunerationDirigeants") ?? 0);
}

export type BilanValuation = {
  /** EBE retraité (€). */
  ebeRetraite: number;
  /** EBE retraité / CA (rentabilité « vraie »), null si CA inconnu. */
  tauxEbeRetraite: number | null;
  /** Fourchette de valorisation du fonds par multiple d'EBE retraité (€). */
  ebeLow: number;
  ebeMid: number;
  ebeHigh: number;
  /** Multiples appliqués (bas / médian / haut). */
  ebeMultLow: number;
  ebeMultHigh: number;
  /** Fourchette par % du CA (méthode secondaire, sur CA HT), null si CA inconnu. */
  caLow: number | null;
  caMid: number | null;
  caHigh: number | null;
  caPctLow: number;
  caPctHigh: number;
};

/**
 * Valorisation INDICATIVE du fonds de commerce d'une officine, à partir de
 * l'EBE retraité (méthode principale) et du CA (méthode secondaire). Fourchettes
 * volontairement larges : une valorisation réelle exige un professionnel
 * (expert-comptable / transactionnaire). Renvoie null si EBE inconnu.
 */
export function computeValuation(d: BilanData): BilanValuation | null {
  const ebeR = computeEbeRetraite(d);
  if (ebeR == null) return null;
  const ca = num(d, "chiffreAffaires");
  const ebeMultLow = 4.5;
  const ebeMultHigh = 6.5;
  const caPctLow = 0.75;
  const caPctHigh = 0.95;
  return {
    ebeRetraite: ebeR,
    tauxEbeRetraite: ca && ca !== 0 ? ebeR / ca : null,
    ebeLow: ebeR * ebeMultLow,
    ebeMid: ebeR * ((ebeMultLow + ebeMultHigh) / 2),
    ebeHigh: ebeR * ebeMultHigh,
    ebeMultLow,
    ebeMultHigh,
    caLow: ca != null ? ca * caPctLow : null,
    caMid: ca != null ? ca * ((caPctLow + caPctHigh) / 2) : null,
    caHigh: ca != null ? ca * caPctHigh : null,
    caPctLow,
    caPctHigh,
  };
}

/** Variation relative N vs N-1 d'un poste (null si non calculable). */
export function fieldEvolution(
  data: BilanData,
  prev: BilanData,
  key: BilanFieldKey
): number | null {
  const n = num(data, key);
  const p = num(prev, key);
  if (n == null || p == null || p === 0) return null;
  return (n - p) / Math.abs(p);
}
