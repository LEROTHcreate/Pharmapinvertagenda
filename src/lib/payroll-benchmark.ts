/**
 * Moteur de benchmark de rémunération.
 *
 * Pour un salarié, compare son taux horaire brut réel à deux références :
 *  1. Le MINIMUM CONVENTIONNEL applicable (métier × ancienneté → coefficient,
 *     plancher SMIC) → enjeu LÉGAL (être sous ce seuil est une infraction).
 *  2. La MOYENNE MARCHÉ de son métier, ajustée à la région → enjeu
 *     ATTRACTIVITÉ / RÉTENTION.
 *
 * Aucune donnée nouvelle requise : on dérive le coefficient « attendu » de
 * l'ancienneté (hireDate) et on utilise le taux horaire déjà saisi.
 */

import type { EmployeeStatus } from "@prisma/client";
import {
  type Region,
  conventionalMinHourly,
  conventionalMinMonthly,
  expectedCoefficient,
  sectorAverageHourly,
  sectorAverageMonthly,
} from "@/lib/payroll-reference";

export type BenchmarkInput = {
  status: EmployeeStatus;
  /** Taux horaire brut EFFECTIF (€) — saisi en horaire, ou implicite en
   *  mode mensuel (salaire / heures contractuelles). Null si non renseigné. */
  hourlyGrossRate: number | null;
  /** Ancienneté en mois (depuis hireDate). */
  seniorityMonths: number;
  /** Coefficient conventionnel saisi. Si fourni, prioritaire sur l'estimation
   *  par ancienneté. */
  coefficient?: number | null;
  region: Region;
  /** Mois analysé (YYYY-MM) — pour la valeur du point / SMIC applicable. */
  month: string;
};

export type LegalStatus = "below_min" | "at_min" | "ok" | "unknown";
export type MarketStatus = "under" | "aligned" | "above" | "na";

export type Benchmark = {
  /** Coefficient attendu (estimé via l'ancienneté). */
  coefficient: number;
  coefficientLabel: string;
  /** Minimum conventionnel horaire/mensuel applicable. */
  minHourly: number;
  minMonthly: number;
  /** Moyenne marché horaire/mensuelle (null si non salarié, ex. titulaire). */
  marketHourly: number | null;
  marketMonthly: number | null;
  /** Position légale vs minimum conventionnel. */
  legal: LegalStatus;
  /** Position vs marché. */
  market: MarketStatus;
  /** Écart au marché en % (positif = au-dessus), null si non comparable. */
  marketGapPct: number | null;
  /** Écart au minimum en €/h (positif = marge au-dessus du minimum). */
  minGapHourly: number | null;
};

/** Tolérance pour considérer un taux « aligné » sur une référence (±3 %). */
const ALIGN_TOLERANCE = 0.03;

export function computeBenchmark(input: BenchmarkInput): Benchmark {
  const seniorityYears = input.seniorityMonths / 12;
  const estimated = expectedCoefficient(input.status, seniorityYears);
  // Coefficient saisi prioritaire ; sinon estimation par ancienneté.
  const coefficient = input.coefficient ?? estimated.coefficient;
  const coefficientLabel =
    input.coefficient != null ? "Coefficient saisi" : estimated.label;

  const minHourly = conventionalMinHourly(coefficient, input.month);
  const minMonthly = conventionalMinMonthly(coefficient, input.month);
  const marketHourly = sectorAverageHourly(input.status, input.region);
  const marketMonthly = sectorAverageMonthly(input.status, input.region);

  const rate = input.hourlyGrossRate;

  // ── Position légale ──
  let legal: LegalStatus = "unknown";
  let minGapHourly: number | null = null;
  if (rate != null) {
    minGapHourly = round2(rate - minHourly);
    if (rate < minHourly - 0.01) legal = "below_min";
    else if (rate <= minHourly + 0.01) legal = "at_min";
    else legal = "ok";
  }

  // ── Position marché ──
  let market: MarketStatus = "na";
  let marketGapPct: number | null = null;
  if (rate != null && marketHourly != null && marketHourly > 0) {
    marketGapPct = round1(((rate - marketHourly) / marketHourly) * 100);
    if (rate < marketHourly * (1 - ALIGN_TOLERANCE)) market = "under";
    else if (rate > marketHourly * (1 + ALIGN_TOLERANCE)) market = "above";
    else market = "aligned";
  }

  return {
    coefficient,
    coefficientLabel,
    minHourly,
    minMonthly,
    marketHourly,
    marketMonthly,
    legal,
    market,
    marketGapPct,
    minGapHourly,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
