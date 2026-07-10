/**
 * Référentiel des postes financiers d'un « Bilan » (compte de résultat + bilan
 * comptable) + calcul des ratios clés d'une officine. Sert à la saisie, à
 * l'extraction (prompt) et à l'analyse.
 */

export type BilanFieldKey =
  // Compte de résultat
  | "chiffreAffaires"
  | "achatsMarchandises"
  | "margeBrute"
  | "chargesExternes"
  | "chargesPersonnel"
  | "impotsTaxes"
  | "dotationsAmortissements"
  | "ebe"
  | "resultatExploitation"
  | "resultatCourant"
  | "impotSocietes"
  | "resultatNet"
  // Bilan — Actif
  | "actifImmobilise"
  | "stocks"
  | "creancesClients"
  | "tresorerie"
  | "totalActif"
  // Bilan — Passif
  | "capitauxPropres"
  | "dettesFinancieres"
  | "dettesFournisseurs"
  | "dettesFiscalesSociales"
  | "totalPassif";

export type BilanGroup =
  | "Compte de résultat"
  | "Bilan — Actif"
  | "Bilan — Passif";

export type BilanField = {
  key: BilanFieldKey;
  label: string;
  group: BilanGroup;
  hint?: string;
};

export const BILAN_FIELDS: BilanField[] = [
  // ─── Compte de résultat ───
  { key: "chiffreAffaires", label: "Chiffre d'affaires HT", group: "Compte de résultat", hint: "Ventes totales hors taxes de l'exercice" },
  { key: "achatsMarchandises", label: "Achats de marchandises", group: "Compte de résultat", hint: "Coût d'achat des médicaments/produits vendus" },
  { key: "margeBrute", label: "Marge brute", group: "Compte de résultat", hint: "CA − achats consommés" },
  { key: "chargesExternes", label: "Charges externes", group: "Compte de résultat", hint: "Loyer, énergie, honoraires, assurances…" },
  { key: "chargesPersonnel", label: "Charges de personnel", group: "Compte de résultat", hint: "Salaires + charges sociales" },
  { key: "impotsTaxes", label: "Impôts & taxes", group: "Compte de résultat" },
  { key: "dotationsAmortissements", label: "Dotations aux amortissements", group: "Compte de résultat" },
  { key: "ebe", label: "Excédent brut d'exploitation (EBE)", group: "Compte de résultat", hint: "Marge après charges d'exploitation, avant amortissements" },
  { key: "resultatExploitation", label: "Résultat d'exploitation", group: "Compte de résultat" },
  { key: "resultatCourant", label: "Résultat courant avant impôt", group: "Compte de résultat" },
  { key: "impotSocietes", label: "Impôt sur les sociétés", group: "Compte de résultat" },
  { key: "resultatNet", label: "Résultat net", group: "Compte de résultat", hint: "Bénéfice/perte final de l'exercice" },
  // ─── Bilan — Actif ───
  { key: "actifImmobilise", label: "Actif immobilisé", group: "Bilan — Actif", hint: "Fonds de commerce, matériel, agencements (net)" },
  { key: "stocks", label: "Stocks", group: "Bilan — Actif" },
  { key: "creancesClients", label: "Créances clients", group: "Bilan — Actif", hint: "Tiers payant, mutuelles à encaisser…" },
  { key: "tresorerie", label: "Trésorerie", group: "Bilan — Actif", hint: "Disponibilités en banque/caisse" },
  { key: "totalActif", label: "Total actif", group: "Bilan — Actif" },
  // ─── Bilan — Passif ───
  { key: "capitauxPropres", label: "Capitaux propres", group: "Bilan — Passif", hint: "Capital + réserves + résultat" },
  { key: "dettesFinancieres", label: "Dettes financières", group: "Bilan — Passif", hint: "Emprunts bancaires (dont rachat officine)" },
  { key: "dettesFournisseurs", label: "Dettes fournisseurs", group: "Bilan — Passif", hint: "Grossistes, laboratoires à payer" },
  { key: "dettesFiscalesSociales", label: "Dettes fiscales & sociales", group: "Bilan — Passif", hint: "URSSAF, TVA, IS à payer" },
  { key: "totalPassif", label: "Total passif", group: "Bilan — Passif" },
];

export const BILAN_GROUPS: BilanGroup[] = [
  "Compte de résultat",
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
  /** Valeur brute (pour tri/comparaison), null si non calculable. */
  raw: number | null;
  tone: "good" | "warning" | "bad" | "neutral";
  hint: string;
};

const pctFmt = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
const num = (d: BilanData, k: BilanFieldKey): number | null =>
  typeof d[k] === "number" && !Number.isNaN(d[k]) ? (d[k] as number) : null;

/**
 * Ratios clés d'une officine. Les seuils d'appréciation sont indicatifs
 * (ordres de grandeur du secteur pharmacie), pas des vérités absolues.
 */
export function computeBilanRatios(d: BilanData): BilanRatio[] {
  const ca = num(d, "chiffreAffaires");
  const ebe = num(d, "ebe");
  const rn = num(d, "resultatNet");
  const marge = num(d, "margeBrute");
  const perso = num(d, "chargesPersonnel");
  const cp = num(d, "capitauxPropres");
  const tp = num(d, "totalPassif") ?? num(d, "totalActif");
  const detteFi = num(d, "dettesFinancieres");
  const treso = num(d, "tresorerie");

  const out: BilanRatio[] = [];
  const ratio = (a: number | null, b: number | null) =>
    a != null && b != null && b !== 0 ? a / b : null;

  const tauxMarge = ratio(marge, ca);
  out.push({
    key: "tauxMarge",
    label: "Taux de marge brute",
    value: tauxMarge != null ? pctFmt(tauxMarge) : "—",
    raw: tauxMarge,
    tone: tauxMarge == null ? "neutral" : tauxMarge >= 0.3 ? "good" : tauxMarge >= 0.25 ? "warning" : "bad",
    hint: "Marge brute / CA. Repère officine ≈ 30-33 %.",
  });

  const tauxEbe = ratio(ebe, ca);
  out.push({
    key: "tauxEbe",
    label: "Taux d'EBE",
    value: tauxEbe != null ? pctFmt(tauxEbe) : "—",
    raw: tauxEbe,
    tone: tauxEbe == null ? "neutral" : tauxEbe >= 0.1 ? "good" : tauxEbe >= 0.06 ? "warning" : "bad",
    hint: "EBE / CA. Rentabilité d'exploitation ; repère sain ≥ 10 %.",
  });

  const rentaNette = ratio(rn, ca);
  out.push({
    key: "rentaNette",
    label: "Rentabilité nette",
    value: rentaNette != null ? pctFmt(rentaNette) : "—",
    raw: rentaNette,
    tone: rentaNette == null ? "neutral" : rentaNette >= 0.05 ? "good" : rentaNette >= 0.02 ? "warning" : "bad",
    hint: "Résultat net / CA.",
  });

  const masseSal = ratio(perso, ca);
  out.push({
    key: "masseSalariale",
    label: "Masse salariale / CA",
    value: masseSal != null ? pctFmt(masseSal) : "—",
    raw: masseSal,
    tone: masseSal == null ? "neutral" : masseSal <= 0.1 ? "good" : masseSal <= 0.13 ? "warning" : "bad",
    hint: "Poids du personnel. Repère officine ≈ 9-12 % du CA.",
  });

  const autonomie = ratio(cp, tp);
  out.push({
    key: "autonomie",
    label: "Autonomie financière",
    value: autonomie != null ? pctFmt(autonomie) : "—",
    raw: autonomie,
    tone: autonomie == null ? "neutral" : autonomie >= 0.3 ? "good" : autonomie >= 0.2 ? "warning" : "bad",
    hint: "Capitaux propres / total bilan. Solidité ; ≥ 30 % = confortable.",
  });

  // Capacité de remboursement = dettes financières / EBE (en années)
  const capRemb = ratio(detteFi, ebe);
  out.push({
    key: "capaciteRemboursement",
    label: "Capacité de remboursement",
    value: capRemb != null ? `${capRemb.toFixed(1).replace(".", ",")} ans` : "—",
    raw: capRemb,
    tone: capRemb == null ? "neutral" : capRemb <= 5 ? "good" : capRemb <= 7 ? "warning" : "bad",
    hint: "Dettes financières / EBE. < 5 ans = sain (norme bancaire).",
  });

  // Trésorerie en mois de charges de personnel (proxy de coussin)
  const tresoMois = perso && perso > 0 && treso != null ? treso / (perso / 12) : null;
  out.push({
    key: "tresorerie",
    label: "Coussin de trésorerie",
    value: tresoMois != null ? `${tresoMois.toFixed(1).replace(".", ",")} mois` : treso != null ? `${Math.round(treso).toLocaleString("fr-FR")} €` : "—",
    raw: tresoMois,
    tone: tresoMois == null ? "neutral" : tresoMois >= 1.5 ? "good" : tresoMois >= 0.5 ? "warning" : "bad",
    hint: "Trésorerie rapportée à un mois de masse salariale.",
  });

  return out;
}
