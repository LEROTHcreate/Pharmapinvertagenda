/**
 * Prévision de masse salariale (coût employeur) sur N mois à venir.
 *
 * Plus fin qu'un simple « coût du mois × 12 » : on part du coût mensuel courant
 * de chaque salarié (moyenne récente = run-rate) et on retire ceux dont le
 * contrat / départ est daté — la projection décroche donc aux fins de contrat
 * connues (CDD, départs planifiés).
 *
 * NB congés payés : ils sont DÉJÀ inclus dans le coût mensuel (un salarié en
 * congé est payé) → pas de « creux d'été » artificiel pour l'équipe en place.
 * Le vrai surcoût estival (remplaçants saisonniers) n'est pas modélisé ici tant
 * qu'il n'est pas saisi.
 */

export type ForecastEmployee = {
  /** Coût employeur mensuel courant estimé (run-rate). */
  monthlyCost: number;
  /** Fin de contrat / départ daté (le plus proche), ou null si en cours. */
  endDate: Date | null;
};

export type ForecastPoint = {
  /** "YYYY-MM" */
  key: string;
  /** Libellé court, ex. "août 26". */
  label: string;
  cost: number;
  /** Nb de salariés comptés ce mois-là (pour info / tooltip). */
  headcount: number;
};

/**
 * Projette le coût employeur mensuel sur `n` mois à partir de `from`
 * (interprété comme le 1ᵉʳ mois projeté). Un salarié dont `endDate` précède le
 * début d'un mois n'est plus compté à partir de ce mois.
 */
export function forecastPayroll(
  employees: ForecastEmployee[],
  from: Date,
  n = 12
): ForecastPoint[] {
  const out: ForecastPoint[] = [];
  const y0 = from.getUTCFullYear();
  const m0 = from.getUTCMonth();
  for (let i = 0; i < n; i++) {
    const monthStart = new Date(Date.UTC(y0, m0 + i, 1));
    let cost = 0;
    let headcount = 0;
    for (const e of employees) {
      // Contrat terminé avant le début du mois → non compté.
      if (e.endDate && e.endDate < monthStart) continue;
      cost += e.monthlyCost;
      headcount += 1;
    }
    const key = `${monthStart.getUTCFullYear()}-${String(
      monthStart.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    const label = monthStart
      .toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
      .replace(".", "");
    out.push({ key, label, cost: Math.round(cost), headcount });
  }
  return out;
}

/** Total projeté sur la période (somme des coûts mensuels). */
export function forecastTotal(points: ForecastPoint[]): number {
  return points.reduce((s, p) => s + p.cost, 0);
}
