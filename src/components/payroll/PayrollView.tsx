"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Lightbulb,
  Loader2,
  MapPin,
  Minus,
  Pencil,
  Printer,
  Save,
  Scale,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/types";
import type { EmployeeStatus } from "@prisma/client";
import { computeBenchmark, type Benchmark } from "@/lib/payroll-benchmark";
import { computeInsights, type Insight } from "@/lib/payroll-insights";
import {
  REFERENCE_META,
  REGION_LABELS,
  type Region,
} from "@/lib/payroll-reference";
import { AbsenceImpactPanel } from "@/components/payroll/AbsenceImpactPanel";

type Line = {
  employeeId: string;
  employeeName: string;
  status: EmployeeStatus;
  seniorityMonths: number;
  payMode: "HOURLY" | "MONTHLY";
  hourlyGrossRate: number | null;
  monthlyGrossSalary: number | null;
  effectiveHourlyRate: number | null;
  effectiveMonthlySalary: number | null;
  coefficient: number | null;
  taskHoursRegular: number;
  overtimeHours25: number;
  overtimeHours50: number;
  overtimeReference: "WEEKLY" | "BIWEEKLY";
  overtimePeriods: {
    weekStart: string;
    hours: number;
    overtime25: number;
    overtime50: number;
  }[];
  paidLeaveHours: number;
  trainingHours: number;
  sickHoursEmployerPaid: number;
  sickHoursWaitingPeriod: number;
  sickHoursCpam: number;
  unpaidAbsenceHours: number;
  grossEmployer: number;
  isCadre: boolean;
  socialContributionsEmployee: number;
  hsEmployeeReduction: number;
  hsEmployerDeduction: number;
  netEstimated: number;
  socialContributionsEmployer: number;
  reductionGenerale: number;
  totalEmployerCost: number;
  overtimePremiumCost: number;
};

/** Tooltip listant les heures sup période par période (semaine ou quinzaine). */
function overtimePeriodsTitle(line: {
  overtimeReference: "WEEKLY" | "BIWEEKLY";
  overtimePeriods: { weekStart: string; overtime25: number; overtime50: number }[];
}): string {
  const label = line.overtimeReference === "BIWEEKLY" ? "Quinzaine du" : "Semaine du";
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };
  const rows = line.overtimePeriods
    .filter((p) => p.overtime25 + p.overtime50 > 0)
    .map(
      (p) =>
        `${label} ${fmt(p.weekStart)} : +25% ${p.overtime25.toFixed(1)}h · +50% ${p.overtime50.toFixed(1)}h`
    );
  return rows.join("\n");
}

const REGION_KEY = "pp_payroll_region";
const REGIONS: Region[] = [
  "NATIONAL",
  "IDF",
  "GRANDE_METROPOLE",
  "PROVINCE",
  "RURAL",
];

type Totals = {
  grossEmployer: number;
  netEstimated: number;
  socialContributionsEmployer: number;
  totalEmployerCost: number;
};

type SortMode = "order" | "cost" | "gross" | "name";

const SORT_LABELS: Record<SortMode, string> = {
  order: "Ordre équipe",
  cost: "Coût ↓",
  gross: "Brut ↓",
  name: "Nom A→Z",
};

/** Trie une COPIE des lignes selon le mode choisi (l'ordre "équipe" = API). */
function sortLines(lines: Line[], mode: SortMode): Line[] {
  if (mode === "order") return lines;
  const copy = [...lines];
  if (mode === "cost")
    copy.sort((a, b) => b.totalEmployerCost - a.totalEmployerCost);
  else if (mode === "gross")
    copy.sort((a, b) => b.grossEmployer - a.grossEmployer);
  else if (mode === "name")
    copy.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "fr"));
  return copy;
}

/** Sous-totaux (coût officine + net) par statut, triés par coût décroissant. */
function subtotalsByStatus(
  lines: Line[]
): Array<{ status: EmployeeStatus; count: number; cost: number; net: number }> {
  const map = new Map<
    EmployeeStatus,
    { count: number; cost: number; net: number }
  >();
  for (const l of lines) {
    if (l.totalEmployerCost <= 0) continue; // ignore les rému non saisies
    const cur = map.get(l.status) ?? { count: 0, cost: 0, net: 0 };
    cur.count += 1;
    cur.cost += l.totalEmployerCost;
    cur.net += l.netEstimated;
    map.set(l.status, cur);
  }
  return Array.from(map.entries())
    .map(([status, v]) => ({ status, ...v }))
    .sort((a, b) => b.cost - a.cost);
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

export function PayrollView({ initialMonth }: { initialMonth: string }) {
  const { toast } = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  // CA HT du mois saisi par le titulaire (pour le ratio masse salariale / CA).
  const [revenue, setRevenue] = useState<{
    revenueHT: number;
    marginHT: number | null;
  } | null>(null);
  // Région choisie pour le benchmark marché (persistée localement).
  const [region, setRegion] = useState<Region>("NATIONAL");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(REGION_KEY) as Region | null;
    if (saved && saved in REGION_LABELS) setRegion(saved);
  }, []);
  const changeRegion = useCallback((r: Region) => {
    setRegion(r);
    try {
      window.localStorage.setItem(REGION_KEY, r);
    } catch {
      /* localStorage indispo — non bloquant */
    }
  }, []);
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("order");

  // Lignes triées pour l'affichage (l'ordre "équipe" respecte l'API).
  const displayLines = useMemo(() => sortLines(lines, sortMode), [lines, sortMode]);
  // Sous-totaux par statut (coût officine + net) pour la vue titulaire.
  const statusSubtotals = useMemo(() => subtotalsByStatus(lines), [lines]);

  const handleExportCsv = useCallback(async () => {
    setExportingCsv(true);
    try {
      const res = await fetch(`/api/payroll/export-comptable?month=${month}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          tone: "error",
          title: "Export impossible",
          description: data.error ?? "Erreur lors de la génération du fichier",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `remuneration_${month}_comptable.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportingCsv(false);
    }
  }, [month, toast]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/payroll/export?month=${month}&region=${region}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          tone: "error",
          title: "Export impossible",
          description: data.error ?? "Erreur lors de la génération du fichier",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `remuneration_${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [month, region, toast]);

  const fetchPayroll = useCallback(
    async (m: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/payroll?month=${m}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast({
            tone: "error",
            title: "Chargement impossible",
            description: data.error ?? "Erreur réseau",
          });
          return;
        }
        const data = await res.json();
        setLines(data.lines);
        setTotals(data.totals);
        setRevenue(data.revenue ?? null);
        // Région : si l'utilisateur n'a pas de préférence locale, on adopte
        // celle réglée au niveau de la pharmacie (renvoyée par l'API).
        if (
          typeof window !== "undefined" &&
          !window.localStorage.getItem(REGION_KEY) &&
          data.region &&
          data.region in REGION_LABELS
        ) {
          setRegion(data.region as Region);
        }
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    fetchPayroll(month);
  }, [month, fetchPayroll]);

  // Benchmark par salarié (métier × ancienneté → coefficient, ajusté région).
  const benchmarks = useMemo(() => {
    const m = new Map<string, Benchmark>();
    for (const l of lines) {
      m.set(
        l.employeeId,
        computeBenchmark({
          status: l.status,
          hourlyGrossRate: l.effectiveHourlyRate,
          seniorityMonths: l.seniorityMonths,
          coefficient: l.coefficient,
          region,
          month,
        })
      );
    }
    return m;
  }, [lines, region, month]);

  // Recommandations agrégées (« comment mieux faire »).
  const insights = useMemo(() => {
    return computeInsights(
      lines.map((l) => ({
        employeeName: l.employeeName,
        hourlyGrossRate: l.hourlyGrossRate,
        grossEmployer: l.grossEmployer,
        totalEmployerCost: l.totalEmployerCost,
        overtimeHours: l.overtimeHours25 + l.overtimeHours50,
        overtimePremiumCost: l.overtimePremiumCost,
        benchmark:
          benchmarks.get(l.employeeId) ??
          computeBenchmark({
            status: l.status,
            hourlyGrossRate: l.effectiveHourlyRate,
            seniorityMonths: l.seniorityMonths,
            coefficient: l.coefficient,
            region,
            month,
          }),
      }))
    );
  }, [lines, benchmarks, region, month]);

  // Synthèse « niveaux de paie vs marché » (agrégé) — angle propre à
  // Rémunération : combien de salariés sous / alignés / au-dessus du marché,
  // conformité au minimum conventionnel, et écart moyen au marché.
  const marketSummary = useMemo(() => {
    let under = 0;
    let aligned = 0;
    let above = 0;
    let belowMin = 0;
    const gaps: number[] = [];
    for (const l of lines) {
      const b = benchmarks.get(l.employeeId);
      if (!b) continue;
      if (b.legal === "below_min") belowMin += 1;
      if (b.market === "under") under += 1;
      else if (b.market === "aligned") aligned += 1;
      else if (b.market === "above") above += 1;
      if (b.marketGapPct != null) gaps.push(b.marketGapPct);
    }
    const comparable = under + aligned + above;
    const avgGap = gaps.length
      ? Math.round((gaps.reduce((s, x) => s + x, 0) / gaps.length) * 10) / 10
      : null;
    return { under, aligned, above, belowMin, comparable, avgGap };
  }, [lines, benchmarks]);

  return (
    <div className="p-3 md:p-4 space-y-4">
      {/* En-tête */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-zinc-900">
            Rémunération
          </h1>
          <p className="text-[12.5px] text-zinc-500 mt-0.5 capitalize">
            {monthLabel(month)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Sélecteur de région — ajuste la moyenne marché du benchmark */}
          <label className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 h-9 text-[12.5px]">
            <MapPin className="h-3.5 w-3.5 text-violet-500" />
            <select
              value={region}
              onChange={(e) => changeRegion(e.target.value as Region)}
              aria-label="Région pour le benchmark"
              className="bg-transparent outline-none font-medium text-foreground/80 cursor-pointer pr-1"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
            <button
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-accent/60"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setMonth(
                  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
                );
              }}
              className="h-7 px-3 rounded-full text-[12px] font-medium text-foreground/80 hover:bg-accent/60"
            >
              Ce mois-ci
            </button>
            <button
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-accent/60"
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {/* Export Excel — récap mensuel + masse salariale pour le comptable */}
          <button
            onClick={handleExport}
            disabled={exporting || lines.length === 0}
            title="Télécharger la rémunération du mois au format Excel"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 h-9 text-[12.5px] font-medium text-foreground/80 hover:bg-accent/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Excel
          </button>
          {/* Export CSV comptable — détail des heures pour saisie/import paie */}
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv || lines.length === 0}
            title="Télécharger le détail des heures au format CSV (comptable / import paie)"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 h-9 text-[12.5px] font-medium text-foreground/80 hover:bg-accent/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportingCsv ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            CSV
          </button>
          {/* Export PDF — impression navigateur (Enregistrer au format PDF) */}
          <button
            onClick={() => window.print()}
            disabled={lines.length === 0}
            title="Imprimer / enregistrer en PDF la synthèse du mois"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 h-9 text-[12.5px] font-medium text-foreground/80 hover:bg-accent/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </header>

      {/* Titre réservé à l'impression (l'en-tête interactif est masqué en PDF) */}
      <div className="print-only mb-2">
        <h1 className="text-lg font-bold">Rémunération — synthèse</h1>
        <p className="text-sm">
          {new Date(`${month}-01T00:00:00`).toLocaleDateString("fr-FR", {
            month: "long",
            year: "numeric",
          })}
          {" · estimation indicative (pas un bulletin de paie légal)"}
        </p>
      </div>

      {/* Avertissement légal */}
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-3 sm:p-4 flex items-start gap-3">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
        <div className="text-[12.5px] text-amber-900 leading-relaxed">
          <p className="font-medium">Estimation indicative — pas un bulletin de paie légal</p>
          <p className="mt-0.5">
            Les calculs ci-dessous suivent les règles publiques (carence maladie 3j, IJSS Sécu Sociale,
            heures sup +25%/+50%, cotisations moyennes). Pour la paie réelle, utilisez un logiciel
            agréé (Silae, Sage Paie…) ou un expert-comptable. Les taux de cotisations exacts dépendent
            du statut, de l'ancienneté, et de la <strong>Convention Collective Pharmacie d'Officine (IDCC 1996)</strong>.
          </p>
        </div>
      </div>

      {/* Complétude des données — évite de lire des totaux partiels */}
      {!loading &&
        lines.length > 0 &&
        (() => {
          const missing = lines.filter(
            (l) => l.hourlyGrossRate == null && l.monthlyGrossSalary == null
          ).length;
          if (missing === 0) return null;
          const filled = lines.length - missing;
          return (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50/70 px-3.5 py-2.5 text-[12.5px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                <strong>
                  Rémunération saisie pour {filled}/{lines.length} salariés.
                </strong>{" "}
                Les totaux ne comptent que ces {filled}. Renseignez les {missing}{" "}
                manquant{missing > 1 ? "s" : ""} (colonne Rémunération) pour une
                masse salariale complète.
              </p>
            </div>
          );
        })()}

      {/* Récap totaux */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <TotalCard label="Brut total (employeur)" value={totals.grossEmployer} tone="zinc" />
          <TotalCard label="Net estimé total" value={totals.netEstimated} tone="emerald" />
          <TotalCard label="Charges patronales" value={totals.socialContributionsEmployer} tone="amber" />
          <TotalCard label="Coût total officine" value={totals.totalEmployerCost} tone="violet" big />
        </div>
      )}

      {/* Positionnement des rémunérations vs marché (agrégé) — angle propre à
          Rémunération : niveaux de paie individuels + conformité conventionnelle.
          Les RATIOS de gestion (masse sal./CA, productivité) sont dans Pilotage. */}
      {!loading && marketSummary.comparable > 0 && (
        <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-800 dark:text-foreground">
              <Scale className="h-4 w-4 text-violet-600" /> Rémunérations vs marché
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {REGION_LABELS[region]} · {marketSummary.comparable} salarié
              {marketSummary.comparable > 1 ? "s" : ""} comparé
              {marketSummary.comparable > 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <MarketStat
              label="Sous le marché"
              value={marketSummary.under}
              tone="amber"
            />
            <MarketStat
              label="Alignés (±3 %)"
              value={marketSummary.aligned}
              tone="emerald"
            />
            <MarketStat
              label="Au-dessus"
              value={marketSummary.above}
              tone="violet"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            {marketSummary.avgGap != null && (
              <span className="text-muted-foreground">
                Écart moyen au marché :{" "}
                <strong
                  className={cn(
                    "tabular-nums",
                    marketSummary.avgGap < 0
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-emerald-700 dark:text-emerald-400"
                  )}
                >
                  {marketSummary.avgGap > 0 ? "+" : ""}
                  {marketSummary.avgGap.toFixed(1).replace(".", ",")} %
                </strong>
              </span>
            )}
            {marketSummary.belowMin > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {marketSummary.belowMin} sous le minimum conventionnel — à
                régulariser
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Tous au-dessus du minimum conventionnel
              </span>
            )}
          </div>
          <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted-foreground/80">
            Moyennes marché indicatives ({REGION_LABELS[region]}), à fin de
            comparaison. Détail par salarié dans la colonne « Marché » du tableau.
          </p>
        </div>
      )}

      {/* Coût marginal des heures sup DU MOIS (opérationnel). La projection
          annuelle, le budget et la simulation d'embauche sont regroupés dans
          Pilotage RH (vue stratégique / prévisionnelle). */}
      {totals && (() => {
        const hsCost = lines.reduce((s, l) => s + l.overtimePremiumCost, 0);
        if (hsCost < 1) return null;
        return (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-zinc-50 px-3.5 py-2 text-[12px] text-zinc-600 dark:bg-muted/30 dark:text-muted-foreground">
            <span>
              Majorations heures sup ce mois :{" "}
              <strong className="tabular-nums text-amber-700 dark:text-amber-400">
                {fmt(hsCost)}
              </strong>{" "}
              <span className="opacity-70">
                — économisables en contractualisant les heures récurrentes
              </span>
            </span>
          </div>
        );
      })()}

      {/* Ratio masse salariale / CA du mois (saisie du CA + photo du mois ;
          la TENDANCE du ratio sur 6 mois vit dans Pilotage RH). */}
      {totals && (
        <SalaryRatioCard
          month={month}
          revenue={revenue}
          totalEmployerCost={totals.totalEmployerCost}
          totalWorkedHours={lines.reduce(
            (s, l) =>
              s + l.taskHoursRegular + l.overtimeHours25 + l.overtimeHours50,
            0
          )}
          onSaved={() => fetchPayroll(month)}
        />
      )}

      {/* Recommandations — « comment mieux faire » */}
      {!loading && lines.length > 0 && insights.insights.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-violet-600" />
            <h2 className="text-[13px] font-semibold text-zinc-800">
              Recommandations
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {insights.insights.map((ins) => (
              <InsightCard key={ins.id} insight={ins} />
            ))}
          </div>
        </div>
      )}

      {/* Barre outils tableau : tri */}
      {!loading && lines.length > 1 && (
        <div className="no-print flex items-center justify-end gap-2 text-[12px] text-muted-foreground">
          <span>Trier :</span>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          >
            {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
              <option key={m} value={m}>
                {SORT_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tableau des lignes */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : lines.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucun employé actif sur ce mois.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-zinc-50/60 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="text-left px-3 py-2.5">Employé</th>
                  <th className="text-right px-3 py-2.5">Rémunération</th>
                  <th className="text-right px-3 py-2.5">H trav.</th>
                  <th className="text-right px-3 py-2.5">H sup</th>
                  <th className="text-right px-3 py-2.5">Congés</th>
                  <th className="text-right px-3 py-2.5">Maladie *</th>
                  <th className="text-right px-3 py-2.5">Brut / Net</th>
                  <th className="text-right px-3 py-2.5">Coût officine</th>
                  <th className="text-center px-3 py-2.5">Marché</th>
                </tr>
              </thead>
              <tbody>
                {displayLines.map((l) => (
                  <PayrollRow
                    key={l.employeeId}
                    line={l}
                    benchmark={benchmarks.get(l.employeeId)}
                    onRateUpdated={() => fetchPayroll(month)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sous-totaux par statut (coût officine) — vue titulaire */}
      {!loading && statusSubtotals.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Coût par statut
          </h3>
          <ul className="space-y-1">
            {statusSubtotals.map((s) => (
              <li
                key={s.status}
                className="flex items-center justify-between gap-3 text-[12.5px]"
              >
                <span className="text-zinc-700 dark:text-foreground">
                  {STATUS_LABELS[s.status]}{" "}
                  <span className="text-[11px] text-muted-foreground">
                    ({s.count})
                  </span>
                </span>
                <span className="flex items-baseline gap-3 font-mono tabular-nums">
                  <span className="text-emerald-700" title="Net total du statut">
                    net {fmt(s.net)}
                  </span>
                  <span
                    className="font-semibold text-violet-900 dark:text-violet-300"
                    title="Coût officine total du statut"
                  >
                    {fmt(s.cost)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground italic">
        * Maladie = heures payées par l'employeur après 3 jours de carence (sous condition d'ancienneté ≥ 1 an,
        Convention Pharmacie d'Officine). Les IJSS de la CPAM ne figurent pas dans le coût employeur.
      </p>

      {/* Pont Absences ↔ Paie : détail lisible de l'impact des absences du mois */}
      <AbsenceImpactPanel lines={lines} />

      {/* Fraîcheur des données de référence (benchmark) */}
      <div className="rounded-xl bg-zinc-50/70 px-3 py-2.5 text-[11px] text-zinc-500 leading-relaxed">
        <span className="font-medium text-zinc-600">Données de référence</span> —
        Minimum conventionnel calculé sur la {REFERENCE_META.conventionName} (valeur
        du point datée) ; le coefficient affiché est <strong>estimé via l'ancienneté</strong> et
        peut différer de l'échelon réel. Moyennes marché &amp; écarts régionaux : indicatifs,
        à fin de comparaison. À jour au {fmtDate(REFERENCE_META.lastReviewed)}. Sources :{" "}
        {REFERENCE_META.sources.join(", ")}.
      </div>
    </div>
  );
}

/* ─── Statistique « vs marché » (compteur coloré) ───────────────────── */
function MarketStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "violet";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "emerald"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-violet-700 dark:text-violet-300";
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-center">
      <div className={cn("font-mono text-[22px] font-bold tabular-nums", toneCls)}>
        {value}
      </div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

/* ─── Carte de recommandation ───────────────────────────────────────── */
function InsightCard({ insight }: { insight: Insight }) {
  const cfg = {
    critical: {
      wrap: "border-red-200/70 bg-red-50/70",
      icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
      title: "text-red-900",
    },
    warning: {
      wrap: "border-amber-200/70 bg-amber-50/70",
      icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
      title: "text-amber-900",
    },
    info: {
      wrap: "border-sky-200/60 bg-sky-50/60",
      icon: <Info className="h-4 w-4 text-sky-600" />,
      title: "text-sky-900",
    },
    positive: {
      wrap: "border-emerald-200/60 bg-emerald-50/60",
      icon: <Check className="h-4 w-4 text-emerald-600" />,
      title: "text-emerald-900",
    },
  }[insight.tone];

  return (
    <div className={cn("rounded-2xl border p-3 flex items-start gap-2.5", cfg.wrap)}>
      <div className="mt-0.5 shrink-0">{cfg.icon}</div>
      <div className="min-w-0">
        <p className={cn("text-[12.5px] font-semibold leading-snug", cfg.title)}>
          {insight.title}
        </p>
        <p className="mt-0.5 text-[11.5px] text-zinc-600 leading-relaxed">
          {insight.detail}
        </p>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ─── Ratio masse salariale / chiffre d'affaires ────────────────────── */
function SalaryRatioCard({
  month,
  revenue,
  totalEmployerCost,
  totalWorkedHours,
  onSaved,
}: {
  month: string;
  revenue: { revenueHT: number; marginHT: number | null } | null;
  totalEmployerCost: number;
  /** Heures réellement travaillées ce mois (= mesure du module Statistiques). */
  totalWorkedHours: number;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(revenue === null);
  const [ca, setCa] = useState(revenue ? String(revenue.revenueHT) : "");
  const [marge, setMarge] = useState(
    revenue?.marginHT != null ? String(revenue.marginHT) : ""
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCa(revenue ? String(revenue.revenueHT) : "");
    setMarge(revenue?.marginHT != null ? String(revenue.marginHT) : "");
    setEditing(revenue === null);
  }, [revenue, month]);

  function parseNum(raw: string): number | null | "invalid" {
    const t = raw.trim().replace(/\s/g, "").replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    if (Number.isNaN(n) || n < 0) return "invalid";
    return n;
  }

  async function save() {
    const caVal = parseNum(ca);
    const margeVal = parseNum(marge);
    if (caVal === "invalid" || margeVal === "invalid") {
      toast({ tone: "error", title: "Montant invalide", description: "Saisis un montant en € positif." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/payroll/revenue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, revenueHT: caVal, marginHT: margeVal }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ tone: "error", title: "Sauvegarde impossible", description: d.error ?? "Erreur" });
        return;
      }
      setEditing(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const ratioCa =
    revenue && revenue.revenueHT > 0
      ? (totalEmployerCost / revenue.revenueHT) * 100
      : null;
  const ratioMarge =
    revenue?.marginHT && revenue.marginHT > 0
      ? (totalEmployerCost / revenue.marginHT) * 100
      : null;
  // Ponts avec le module Statistiques (mêmes heures travaillées) :
  //  - CA / heure travaillée = productivité horaire de l'officine ;
  //  - coût horaire moyen = masse salariale ramenée à l'heure produite.
  const caPerHour =
    revenue && revenue.revenueHT > 0 && totalWorkedHours > 0
      ? revenue.revenueHT / totalWorkedHours
      : null;
  const costPerHour =
    totalWorkedHours > 0 ? totalEmployerCost / totalWorkedHours : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-zinc-800">
          Masse salariale / Chiffre d&apos;affaires
        </h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-violet-700"
          >
            <Pencil className="h-3 w-3" /> Modifier
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <label className="text-[11.5px] text-zinc-500">CA HT du mois (€)</label>
            <input
              inputMode="decimal"
              value={ca}
              onChange={(e) => setCa(e.target.value)}
              placeholder="ex : 180000"
              className="block w-40 rounded-md border border-input px-2.5 py-1.5 text-[13px] font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11.5px] text-zinc-500">Marge brute HT (€) — option</label>
            <input
              inputMode="decimal"
              value={marge}
              onChange={(e) => setMarge(e.target.value)}
              placeholder="ex : 55000"
              className="block w-40 rounded-md border border-input px-2.5 py-1.5 text-[13px] font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Enregistrer
            </button>
            {revenue && (
              <button
                onClick={() => setEditing(false)}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100"
                title="Annuler"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : revenue ? (
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          <Metric label="CA HT du mois" value={fmt(revenue.revenueHT)} />
          <Metric
            label="Masse salariale / CA"
            value={ratioCa != null ? `${ratioCa.toFixed(1)} %` : "—"}
            strong
          />
          {ratioMarge != null && (
            <Metric label="Masse salariale / marge" value={`${ratioMarge.toFixed(1)} %`} />
          )}
          {/* Pont Stats ↔ Paie : mêmes heures travaillées, rapportées au CA et au coût */}
          <Metric
            label="Heures travaillées"
            value={`${totalWorkedHours.toFixed(0)} h`}
          />
          {caPerHour != null && (
            <Metric
              label="CA / heure travaillée"
              value={`${fmt(caPerHour)}/h`}
              strong
            />
          )}
          {costPerHour != null && (
            <Metric label="Coût horaire moyen" value={`${fmt(costPerHour)}/h`} />
          )}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Repère officine : la masse salariale (coût total employeur) représente souvent
        ~10 à 14 % du CA HT. Les <strong>heures travaillées</strong> sont celles du
        module Statistiques (même base de calcul) : le CA / heure mesure la
        productivité, le coût horaire moyen la charge salariale par heure produite.
        Saisie du CA manuelle, mise à jour chaque mois.
      </p>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wide font-semibold text-zinc-500">{label}</p>
      <p className={cn("font-mono tabular-nums mt-0.5", strong ? "text-xl font-semibold text-violet-900" : "text-base text-zinc-800")}>
        {value}
      </p>
    </div>
  );
}

function TotalCard({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: number;
  tone: "zinc" | "emerald" | "amber" | "violet";
  big?: boolean;
}) {
  const toneCls: Record<string, string> = {
    zinc: "bg-zinc-50/60 text-zinc-900",
    emerald: "bg-emerald-50/60 text-emerald-900",
    amber: "bg-amber-50/60 text-amber-900",
    violet: "bg-violet-50/70 text-violet-900 ring-1 ring-violet-200/60",
  };
  return (
    <div className={cn("rounded-2xl px-4 py-3", toneCls[tone])}>
      <p className="text-[10.5px] uppercase tracking-wide font-semibold opacity-70">
        {label}
      </p>
      <p className={cn("font-mono tabular-nums font-semibold mt-1", big ? "text-xl" : "text-lg")}>
        {fmt(value)}
      </p>
    </div>
  );
}

function PayrollRow({
  line,
  benchmark,
  onRateUpdated,
}: {
  line: Line;
  benchmark?: Benchmark;
  onRateUpdated: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"HOURLY" | "MONTHLY">(line.payMode);
  const [val, setVal] = useState("");
  const [coeff, setCoeff] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false); // détail brut→net déplié

  function startEdit() {
    setMode(line.payMode);
    setVal(
      line.payMode === "MONTHLY"
        ? line.monthlyGrossSalary != null
          ? String(line.monthlyGrossSalary)
          : ""
        : line.hourlyGrossRate != null
          ? String(line.hourlyGrossRate)
          : ""
    );
    setCoeff(line.coefficient != null ? String(line.coefficient) : "");
    setEditing(true);
  }

  async function saveComp() {
    const raw = val.trim().replace(",", ".");
    const value = raw === "" ? null : Number(raw);
    const maxV = mode === "MONTHLY" ? 50000 : 200;
    if (value !== null && (Number.isNaN(value) || value < 0 || value > maxV)) {
      toast({
        tone: "error",
        title: "Valeur invalide",
        description:
          mode === "MONTHLY"
            ? "Salaire mensuel entre 0 et 50 000 €."
            : "Taux horaire entre 0 et 200 €.",
      });
      return;
    }
    const coeffRaw = coeff.trim();
    const coeffVal = coeffRaw === "" ? null : Number(coeffRaw);
    if (
      coeffVal !== null &&
      (!Number.isInteger(coeffVal) || coeffVal < 0 || coeffVal > 2000)
    ) {
      toast({
        tone: "error",
        title: "Coefficient invalide",
        description: "Entier entre 0 et 2000 (laisser vide pour estimer).",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/employees/${line.employeeId}/compensation`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            payMode: mode,
            hourlyGrossRate: mode === "HOURLY" ? value : null,
            monthlyGrossSalary: mode === "MONTHLY" ? value : null,
            coefficient: coeffVal,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          tone: "error",
          title: "Sauvegarde impossible",
          description: data.error ?? "Erreur",
        });
        return;
      }
      setEditing(false);
      onRateUpdated();
    } finally {
      setBusy(false);
    }
  }

  const overtime = line.overtimeHours25 + line.overtimeHours50;
  const belowMin = benchmark?.legal === "below_min";

  return (
    <>
    <tr className="border-t border-border hover:bg-zinc-50/40 transition-colors">
      <td className="px-3 py-2 font-medium text-zinc-900">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 hover:text-violet-700"
          title="Voir le détail (brut → net, charges)"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-zinc-400 transition-transform",
              open && "rotate-90"
            )}
          />
          {line.employeeName}
          {line.isCadre && (
            <span className="ml-1 rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              cadre
            </span>
          )}
        </button>
      </td>
      <td className="px-3 py-2 text-right align-top">
        {editing ? (
          <div className="inline-flex flex-col items-stretch gap-1 text-left min-w-[150px]">
            {/* Bascule mode horaire / mensuel */}
            <div className="inline-flex self-start rounded-md border border-input overflow-hidden text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setMode("HOURLY")}
                className={cn(
                  "px-2 py-0.5",
                  mode === "HOURLY" ? "bg-violet-600 text-white" : "text-foreground/70 hover:bg-accent/60"
                )}
              >
                €/h
              </button>
              <button
                type="button"
                onClick={() => setMode("MONTHLY")}
                className={cn(
                  "px-2 py-0.5 border-l border-input",
                  mode === "MONTHLY" ? "bg-violet-600 text-white" : "text-foreground/70 hover:bg-accent/60"
                )}
              >
                €/mois
              </button>
            </div>
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                autoFocus
                placeholder={mode === "MONTHLY" ? "€/mois" : "€/h"}
                className="w-20 rounded border border-input px-2 py-0.5 text-right text-[12.5px] font-mono"
              />
              <input
                type="text"
                inputMode="numeric"
                value={coeff}
                onChange={(e) => setCoeff(e.target.value)}
                placeholder="Coeff."
                title="Coefficient conventionnel (optionnel — laisser vide pour estimer via l'ancienneté)"
                className="w-14 rounded border border-input px-2 py-0.5 text-right text-[12.5px] font-mono"
              />
            </div>
            <div className="inline-flex items-center gap-1 self-end">
              <button
                onClick={saveComp}
                disabled={busy}
                className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                title="Enregistrer"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
                title="Annuler"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className={cn(
              "inline-flex items-center gap-1 font-mono tabular-nums hover:text-violet-700",
              belowMin && "text-red-600 font-semibold"
            )}
            title={
              belowMin
                ? `Sous le minimum conventionnel (${benchmark?.minHourly.toFixed(2)} €/h pour le coeff. ${benchmark?.coefficient}). Cliquer pour corriger.`
                : line.payMode === "MONTHLY" && line.effectiveHourlyRate != null
                  ? `≈ ${line.effectiveHourlyRate.toFixed(2)} €/h · cliquer pour modifier`
                  : "Cliquer pour modifier"
            }
          >
            {belowMin && <AlertTriangle className="h-3 w-3 text-red-600" />}
            <span className="inline-flex flex-col items-end leading-tight">
              <span>{compLabel(line)}</span>
              {compSecondary(line) && (
                <span className="text-[10px] font-normal text-zinc-500">
                  {compSecondary(line)}
                </span>
              )}
            </span>
            <Pencil className="h-3 w-3 opacity-50" />
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {line.taskHoursRegular.toFixed(1)} h
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {overtime > 0 ? (
          <span
            title={overtimePeriodsTitle(line)}
            className="inline-flex flex-col items-end leading-tight"
          >
            <span>+{overtime.toFixed(1)} h</span>
            <span className="text-[10px] font-normal text-zinc-500">
              +25% {line.overtimeHours25.toFixed(1)} · +50%{" "}
              {line.overtimeHours50.toFixed(1)}
              {line.overtimeReference === "BIWEEKLY" ? " · /quinz." : ""}
            </span>
          </span>
        ) : (
          <span className="text-zinc-400">
            —
            {line.overtimeReference === "BIWEEKLY" && (
              <span className="ml-1 text-[9px] uppercase tracking-wide">
                quinz.
              </span>
            )}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {(line.paidLeaveHours + line.trainingHours) > 0
          ? `${(line.paidLeaveHours + line.trainingHours).toFixed(1)} h`
          : <span className="text-zinc-400">—</span>}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {line.sickHoursEmployerPaid > 0 || line.sickHoursWaitingPeriod > 0 ? (
          <span title={`Carence (3j non payés) : ${line.sickHoursWaitingPeriod.toFixed(1)}h · CPAM (info) : ${line.sickHoursCpam.toFixed(1)}h`}>
            {line.sickHoursEmployerPaid.toFixed(1)} h
          </span>
        ) : <span className="text-zinc-400">—</span>}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {line.grossEmployer > 0 ? (
          <div className="inline-flex flex-col items-end leading-tight">
            <span className="font-medium text-zinc-900" title="Salaire brut">
              {fmt(line.grossEmployer)}
            </span>
            <span
              className="text-[11px] text-emerald-700"
              title="Net estimé — ce que touche réellement le salarié (à montrer au collaborateur)"
            >
              net {fmt(line.netEstimated)}
            </span>
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-violet-900">
        <span
          title={
            line.reductionGenerale > 0
              ? `Charges patronales : ${fmt(line.socialContributionsEmployer)} (après réduction générale de ${fmt(line.reductionGenerale)}). Coût = brut + charges.`
              : `Charges patronales : ${fmt(line.socialContributionsEmployer)}. Coût = brut + charges.`
          }
        >
          {fmt(line.totalEmployerCost)}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        {benchmark ? <BenchmarkChip benchmark={benchmark} /> : <span className="text-zinc-400">—</span>}
      </td>
    </tr>
    {open && (
      <tr className="bg-zinc-50/60 dark:bg-muted/20">
        <td colSpan={9} className="px-3 pb-3 pt-1">
          <PayrollDetail line={line} />
        </td>
      </tr>
    )}
    </>
  );
}

/* ─── Pastille de position marché / conformité ──────────────────────── */
function BenchmarkChip({ benchmark: b }: { benchmark: Benchmark }) {
  // Priorité visuelle : alerte légale d'abord (sous le minimum conventionnel).
  if (b.legal === "below_min") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300"
        title={`Sous le minimum conventionnel : ${b.minHourly.toFixed(2)} €/h requis (coeff. ${b.coefficient} · ${b.coefficientLabel}).`}
      >
        <AlertTriangle className="h-3 w-3" />
        Sous minimum
      </span>
    );
  }
  if (b.market === "na" || b.marketHourly == null) {
    return (
      <span className="text-[10.5px] text-zinc-400" title="Pas de référence marché salariée">
        n/a
      </span>
    );
  }
  const cfg = {
    under: {
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
      icon: <TrendingDown className="h-3 w-3" />,
      label: "Sous marché",
    },
    aligned: {
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
      icon: <Minus className="h-3 w-3" />,
      label: "Aligné",
    },
    above: {
      cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
      icon: <TrendingUp className="h-3 w-3" />,
      label: "Au-dessus",
    },
  }[b.market];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
        cfg.cls
      )}
      title={
        `Coeff. estimé ${b.coefficient} (${b.coefficientLabel}) · ` +
        `min. conv. ${b.minHourly.toFixed(2)} €/h · ` +
        `moyenne marché ${b.marketHourly.toFixed(2)} €/h` +
        (b.marketGapPct != null
          ? ` · écart ${b.marketGapPct > 0 ? "+" : ""}${b.marketGapPct}%`
          : "")
      }
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

/** Libellé compact de la rémunération selon le mode (horaire / mensuel). */
/** Panneau détail « brut → net » (salarié) et « brut → coût » (officine) —
 *  affiché au clic sur une ligne. Utile au titulaire ET à montrer au salarié. */
function PayrollDetail({ line }: { line: Line }) {
  const rate =
    line.effectiveHourlyRate != null
      ? `${line.effectiveHourlyRate.toFixed(2)} €/h`
      : "—";
  const monthly =
    line.effectiveMonthlySalary != null
      ? `${new Intl.NumberFormat("fr-FR").format(Math.round(line.effectiveMonthlySalary))} €/mois`
      : "—";
  return (
    <div className="rounded-xl bg-white p-3 text-[12px] ring-1 ring-zinc-200 dark:bg-card dark:ring-border">
      <p className="mb-2 text-[11px] text-zinc-500">
        Rémunération :{" "}
        <strong className="text-zinc-700 dark:text-foreground">{rate}</strong> ·{" "}
        {monthly}
        {line.isCadre && " · statut cadre"}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-semibold text-emerald-700">
            Ce que touche le salarié
          </p>
          <Kv label="Salaire brut" value={fmt(line.grossEmployer)} />
          <Kv
            label="− Cotisations salariales"
            value={fmt(line.socialContributionsEmployee)}
          />
          {line.hsEmployeeReduction > 0 && (
            <Kv
              label="dont exonération heures sup"
              value={`+${fmt(line.hsEmployeeReduction)} de net`}
              sub
            />
          )}
          <Kv
            label="= Net estimé"
            value={fmt(line.netEstimated)}
            strong
            tone="emerald"
          />
        </div>
        <div>
          <p className="mb-1 font-semibold text-violet-800">
            Ce que paie l&apos;officine
          </p>
          <Kv label="Salaire brut" value={fmt(line.grossEmployer)} />
          <Kv
            label="+ Charges patronales"
            value={fmt(line.socialContributionsEmployer)}
          />
          {line.reductionGenerale > 0 && (
            <Kv
              label="dont réduction générale"
              value={`−${fmt(line.reductionGenerale)}`}
              sub
            />
          )}
          {line.hsEmployerDeduction > 0 && (
            <Kv
              label="dont déduction HS"
              value={`−${fmt(line.hsEmployerDeduction)}`}
              sub
            />
          )}
          <Kv
            label="= Coût total"
            value={fmt(line.totalEmployerCost)}
            strong
            tone="violet"
          />
        </div>
      </div>
    </div>
  );
}

function Kv({
  label,
  value,
  strong,
  sub,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  sub?: boolean;
  tone?: "emerald" | "violet";
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-0.5",
        sub && "pl-3 text-[11px] text-zinc-400",
        strong &&
          "mt-1 border-t border-zinc-200 pt-1 font-semibold dark:border-border",
        tone === "emerald" && strong && "text-emerald-700",
        tone === "violet" && strong && "text-violet-800"
      )}
    >
      <span className={cn(!sub && "text-zinc-600 dark:text-muted-foreground")}>
        {label}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function compLabel(line: Line): string {
  if (line.payMode === "MONTHLY") {
    return line.monthlyGrossSalary != null
      ? `${new Intl.NumberFormat("fr-FR").format(Math.round(line.monthlyGrossSalary))} €/mois`
      : "—";
  }
  return line.hourlyGrossRate != null
    ? `${line.hourlyGrossRate.toFixed(2)} €/h`
    : "—";
}

/** Équivalent dans l'AUTRE unité (€/h saisi → €/mois, et inversement). */
function compSecondary(line: Line): string | null {
  if (line.payMode === "MONTHLY") {
    return line.effectiveHourlyRate != null
      ? `≈ ${line.effectiveHourlyRate.toFixed(2)} €/h`
      : null;
  }
  return line.effectiveMonthlySalary != null
    ? `≈ ${new Intl.NumberFormat("fr-FR").format(Math.round(line.effectiveMonthlySalary))} €/mois`
    : null;
}
