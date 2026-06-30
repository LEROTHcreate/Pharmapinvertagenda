/**
 * Moteur « pharmacie de garde » — logique pure (sans persistance).
 *
 * Gère les rotations de garde d'une officine :
 *  - compteur d'équité : qui a fait combien de gardes (total + par type),
 *  - suggestion de rotation : à qui revient la prochaine garde pour équilibrer,
 *  - calcul des indemnités de garde (taux configurables par l'officine).
 *
 * Spécifique aux officines françaises (gardes de nuit / dimanche / jours
 * fériés organisées par roulement). Le modèle de persistance (table Prisma)
 * et l'UI seront branchés ensuite ; cette logique est volontairement isolée
 * et testée pour être réutilisable telle quelle.
 */

export type GardeType = "NUIT" | "DIMANCHE" | "JOUR_FERIE";

export const GARDE_TYPES: GardeType[] = ["NUIT", "DIMANCHE", "JOUR_FERIE"];

export const GARDE_TYPE_LABELS: Record<GardeType, string> = {
  NUIT: "Nuit",
  DIMANCHE: "Dimanche",
  JOUR_FERIE: "Jour férié",
};

export type Garde = {
  id: string;
  /** Pharmacien affecté (seuls les pharmaciens assurent les gardes). */
  pharmacistId: string;
  /** Date de la garde (ISO YYYY-MM-DD). */
  date: string;
  /** Type principal de la garde (sert au comptage par catégorie). */
  type: GardeType;
  /**
   * Majorations cumulées EN PLUS du type principal. Permet de modéliser un
   * cumul réel : une garde de NUIT un DIMANCHE, ou un DIMANCHE qui tombe un
   * JOUR_FERIE, etc. Vide/absent ⇒ seul `type` est indemnisé (rétro-compatible).
   */
  extraMajorations?: GardeType[];
};

export type GardeCount = {
  pharmacistId: string;
  total: number;
  byType: Record<GardeType, number>;
};

const emptyByType = (): Record<GardeType, number> => ({
  NUIT: 0,
  DIMANCHE: 0,
  JOUR_FERIE: 0,
});

/**
 * Compte les gardes par pharmacien (inclut ceux à 0 garde), trié du moins
 * chargé au plus chargé — l'ordre dans lequel proposer la prochaine garde.
 * On peut restreindre la période avec `from`/`to` (ISO, bornes incluses).
 */
export function gardeCounts(
  gardes: Garde[],
  pharmacistIds: string[],
  range?: { from?: string; to?: string }
): GardeCount[] {
  const counts = new Map<string, GardeCount>();
  for (const id of pharmacistIds) {
    counts.set(id, { pharmacistId: id, total: 0, byType: emptyByType() });
  }
  for (const g of gardes) {
    const date = normDate(g.date);
    if (range?.from && date < range.from) continue;
    if (range?.to && date > range.to) continue;
    const c = counts.get(g.pharmacistId);
    if (!c) continue; // garde d'un pharmacien hors liste → ignorée
    c.total += 1;
    c.byType[g.type] += 1;
  }
  return Array.from(counts.values()).sort(
    (a, b) => a.total - b.total || a.pharmacistId.localeCompare(b.pharmacistId)
  );
}

export type GardeEquity = {
  counts: GardeCount[];
  /** Moyenne de gardes par pharmacien. */
  average: number;
  /** Écart entre le plus chargé et le moins chargé. */
  spread: number;
  /** Pharmaciens les moins chargés (candidats prioritaires). */
  leastLoaded: string[];
  /** Pharmaciens les plus chargés. */
  mostLoaded: string[];
};

/** Synthèse d'équité de la rotation des gardes. */
export function gardeEquity(
  gardes: Garde[],
  pharmacistIds: string[],
  range?: { from?: string; to?: string }
): GardeEquity {
  const counts = gardeCounts(gardes, pharmacistIds, range);
  if (counts.length === 0) {
    return { counts, average: 0, spread: 0, leastLoaded: [], mostLoaded: [] };
  }
  const totals = counts.map((c) => c.total);
  const sum = totals.reduce((s, n) => s + n, 0);
  const average = sum / counts.length;
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  return {
    counts,
    average,
    spread: max - min,
    leastLoaded: counts.filter((c) => c.total === min).map((c) => c.pharmacistId),
    mostLoaded: counts.filter((c) => c.total === max).map((c) => c.pharmacistId),
  };
}

/**
 * Suggère à qui revient la prochaine garde pour équilibrer la rotation :
 * le(s) pharmacien(s) avec le moins de gardes. On peut exclure des pharmaciens
 * indisponibles (congés, déjà de garde la veille…).
 */
export function suggestNextGarde(
  gardes: Garde[],
  pharmacistIds: string[],
  opts?: { excludeIds?: string[]; range?: { from?: string; to?: string } }
): string[] {
  const exclude = new Set(opts?.excludeIds ?? []);
  const eligible = pharmacistIds.filter((id) => !exclude.has(id));
  if (eligible.length === 0) return [];
  const counts = gardeCounts(gardes, eligible, opts?.range);
  const min = counts[0]?.total ?? 0;
  return counts.filter((c) => c.total === min).map((c) => c.pharmacistId);
}

/* ─── Indemnités de garde ─────────────────────────────────────────────
   Les montants dépendent de la Convention collective / des accords de
   l'officine et évoluent chaque année → ils sont CONFIGURABLES. Les valeurs
   ci-dessous sont des PLACEHOLDERS indicatifs, à remplacer par les vrais taux
   de l'officine. */

export type GardeRates = Record<GardeType, number>;

/** Taux indicatifs (à configurer par l'officine — ne pas prendre pour argent comptant). */
export const GARDE_RATES_PLACEHOLDER: GardeRates = {
  NUIT: 150,
  DIMANCHE: 100,
  JOUR_FERIE: 120,
};

/** Indemnité d'un type de majoration selon les taux de l'officine. */
export function gardeIndemnite(type: GardeType, rates: GardeRates): number {
  return rates[type] ?? 0;
}

/**
 * Indemnité TOTALE d'une garde = type principal + majorations cumulées.
 * Ex. une garde de NUIT (150) un DIMANCHE (100) = 250.
 */
export function gardeAmount(g: Garde, rates: GardeRates): number {
  let amount = gardeIndemnite(g.type, rates);
  for (const m of g.extraMajorations ?? []) amount += gardeIndemnite(m, rates);
  return amount;
}

/** Total des indemnités sur un ensemble de gardes (optionnellement par pharmacien). */
export function totalIndemnites(
  gardes: Garde[],
  rates: GardeRates,
  range?: { from?: string; to?: string }
): { total: number; byPharmacist: Record<string, number> } {
  let total = 0;
  const byPharmacist: Record<string, number> = {};
  for (const g of gardes) {
    const date = normDate(g.date);
    if (range?.from && date < range.from) continue;
    if (range?.to && date > range.to) continue;
    const amount = gardeAmount(g, rates);
    total += amount;
    byPharmacist[g.pharmacistId] = (byPharmacist[g.pharmacistId] ?? 0) + amount;
  }
  return { total, byPharmacist };
}

/** Normalise une date ISO en "YYYY-MM-DD" (retire un éventuel suffixe heure). */
function normDate(iso: string): string {
  return iso.slice(0, 10);
}
