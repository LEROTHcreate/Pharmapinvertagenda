/**
 * Recommandations / aide à la décision pour le titulaire — « comment mieux
 * faire ». À partir des lignes de paie du mois + leur benchmark, on dégage
 * des constats actionnables (risque légal, dérive d'heures sup, risque de
 * départ, masse salariale).
 *
 * Pur calcul, sans I/O : alimenté côté client par PayrollView.
 */

import type { Benchmark } from "@/lib/payroll-benchmark";

export type InsightTone = "critical" | "warning" | "info" | "positive";

export type Insight = {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
};

export type InsightLine = {
  employeeName: string;
  hourlyGrossRate: number | null;
  /** Brut employeur du mois (€). */
  grossEmployer: number;
  /** Coût total employeur du mois (€). */
  totalEmployerCost: number;
  /** Heures sup du mois (toutes majorations confondues). */
  overtimeHours: number;
  /** Surcoût € des majorations d'heures sup (la part +25/+50 uniquement). */
  overtimePremiumCost: number;
  benchmark: Benchmark;
};

export type InsightsResult = {
  insights: Insight[];
  /** Masse salariale (coût total employeur) du mois. */
  totalEmployerCost: number;
  /** Part des heures sup dans le brut (%). */
  overtimeSharePct: number;
};

/** Seuil « nettement sous le marché » → risque de départ (>= 8 %). */
const RETENTION_GAP_PCT = -8;
/** Seuil de récurrence d'heures sup justifiant une révision de contrat (h/mois). */
const OVERTIME_REVIEW_HOURS = 12;

export function computeInsights(lines: InsightLine[]): InsightsResult {
  const insights: Insight[] = [];

  const totalEmployerCost = sum(lines.map((l) => l.totalEmployerCost));
  const totalGross = sum(lines.map((l) => l.grossEmployer));
  const totalOvertimePremium = sum(lines.map((l) => l.overtimePremiumCost));
  const overtimeSharePct =
    totalGross > 0 ? round1((totalOvertimePremium / totalGross) * 100) : 0;

  // ── 1. Risque LÉGAL : sous le minimum conventionnel ──
  const belowMin = lines.filter((l) => l.benchmark.legal === "below_min");
  if (belowMin.length > 0) {
    insights.push({
      id: "legal-below-min",
      tone: "critical",
      title: `${belowMin.length} salarié${belowMin.length > 1 ? "s" : ""} sous le minimum conventionnel`,
      detail:
        `Risque légal : ${listNames(belowMin.map((l) => l.employeeName))}. ` +
        `Le taux horaire est inférieur au minimum de la grille pharmacie d'officine ` +
        `pour le coefficient estimé. Régularisez le taux horaire pour vous mettre en conformité.`,
    });
  }

  // ── 2. Rétention : nettement sous le marché ──
  const underMarket = lines.filter(
    (l) =>
      l.benchmark.market === "under" &&
      l.benchmark.marketGapPct != null &&
      l.benchmark.marketGapPct <= RETENTION_GAP_PCT
  );
  if (underMarket.length > 0) {
    const worst = [...underMarket].sort(
      (a, b) => (a.benchmark.marketGapPct ?? 0) - (b.benchmark.marketGapPct ?? 0)
    );
    insights.push({
      id: "retention-under-market",
      tone: "warning",
      title: `${underMarket.length} salarié${underMarket.length > 1 ? "s" : ""} sous la moyenne du secteur`,
      detail:
        `Risque de départ : ${listNames(worst.map((l) => `${l.employeeName} (${l.benchmark.marketGapPct}%)`))}. ` +
        `Un écart marqué avec le marché local complique la fidélisation — à anticiper avant le prochain entretien.`,
    });
  }

  // ── 3. Heures sup : dérive de coût ──
  if (totalOvertimePremium > 0) {
    const recurrent = lines.filter((l) => l.overtimeHours >= OVERTIME_REVIEW_HOURS);
    const base: Insight = {
      id: "overtime-cost",
      tone: overtimeSharePct >= 8 ? "warning" : "info",
      title: `Heures sup : ${fmt(totalOvertimePremium)} de majorations ce mois (${overtimeSharePct}% du brut)`,
      detail:
        recurrent.length > 0
          ? `${listNames(recurrent.map((l) => l.employeeName))} dépassent régulièrement leur contrat ` +
            `(≥ ${OVERTIME_REVIEW_HOURS} h sup/mois). À ce niveau, augmenter le volume contractuel ` +
            `coûte souvent moins cher que de payer la majoration en continu.`
          : `Les heures sup restent ponctuelles. Surveillez les récurrences : au-delà de ` +
            `${OVERTIME_REVIEW_HOURS} h/mois pour un même salarié, une révision du contrat est plus économique.`,
    };
    insights.push(base);
  }

  // ── 4. Bien aligné : note positive si rien de critique ──
  if (belowMin.length === 0 && underMarket.length === 0) {
    insights.push({
      id: "all-good",
      tone: "positive",
      title: "Rémunérations conformes et alignées sur le marché",
      detail:
        "Aucun salarié sous le minimum conventionnel ni nettement sous la moyenne du secteur. " +
        "Bon équilibre entre maîtrise des coûts et attractivité.",
    });
  }

  return {
    insights,
    totalEmployerCost: round2(totalEmployerCost),
    overtimeSharePct,
  };
}

/* ─── Helpers ─── */
function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} autre${names.length - 3 > 1 ? "s" : ""}`;
}
function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}
