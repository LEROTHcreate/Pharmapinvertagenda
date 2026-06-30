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
  Save,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { EmployeeStatus } from "@prisma/client";
import { computeBenchmark, type Benchmark } from "@/lib/payroll-benchmark";
import { computeInsights, type Insight } from "@/lib/payroll-insights";
import {
  REFERENCE_META,
  REGION_LABELS,
  type Region,
} from "@/lib/payroll-reference";

type Line = {
  employeeId: string;
  employeeName: string;
  status: EmployeeStatus;
  seniorityMonths: number;
  payMode: "HOURLY" | "MONTHLY";
  hourlyGrossRate: number | null;
  monthlyGrossSalary: number | null;
  effectiveHourlyRate: number | null;
  coefficient: number | null;
  taskHoursRegular: number;
  overtimeHours25: number;
  overtimeHours50: number;
  paidLeaveHours: number;
  trainingHours: number;
  sickHoursEmployerPaid: number;
  sickHoursWaitingPeriod: number;
  sickHoursCpam: number;
  unpaidAbsenceHours: number;
  grossEmployer: number;
  socialContributionsEmployee: number;
  netEstimated: number;
  socialContributionsEmployer: number;
  totalEmployerCost: number;
  overtimePremiumCost: number;
};

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
        </div>
      </header>

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

      {/* Récap totaux */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <TotalCard label="Brut total (employeur)" value={totals.grossEmployer} tone="zinc" />
          <TotalCard label="Net estimé total" value={totals.netEstimated} tone="emerald" />
          <TotalCard label="Charges patronales" value={totals.socialContributionsEmployer} tone="amber" />
          <TotalCard label="Coût total officine" value={totals.totalEmployerCost} tone="violet" big />
        </div>
      )}

      {/* Ratio masse salariale / CA */}
      {totals && (
        <SalaryRatioCard
          month={month}
          revenue={revenue}
          totalEmployerCost={totals.totalEmployerCost}
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
                  <th className="text-right px-3 py-2.5">Brut</th>
                  <th className="text-right px-3 py-2.5">Net est.</th>
                  <th className="text-right px-3 py-2.5">Coût total</th>
                  <th className="text-center px-3 py-2.5">Marché</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
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

      <p className="text-[11px] text-muted-foreground italic">
        * Maladie = heures payées par l'employeur après 3 jours de carence (sous condition d'ancienneté ≥ 1 an,
        Convention Pharmacie d'Officine). Les IJSS de la CPAM ne figurent pas dans le coût employeur.
      </p>

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
  onSaved,
}: {
  month: string;
  revenue: { revenueHT: number; marginHT: number | null } | null;
  totalEmployerCost: number;
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
              className="block w-40 rounded-md border border-zinc-300 px-2.5 py-1.5 text-[13px] font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11.5px] text-zinc-500">Marge brute HT (€) — option</label>
            <input
              inputMode="decimal"
              value={marge}
              onChange={(e) => setMarge(e.target.value)}
              placeholder="ex : 55000"
              className="block w-40 rounded-md border border-zinc-300 px-2.5 py-1.5 text-[13px] font-mono"
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
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Repère officine : la masse salariale (coût total employeur) représente souvent
        ~10 à 14 % du CA HT. Saisie manuelle, mise à jour chaque mois.
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
    <tr className="border-t border-border hover:bg-zinc-50/40 transition-colors">
      <td className="px-3 py-2 font-medium text-zinc-900">{line.employeeName}</td>
      <td className="px-3 py-2 text-right align-top">
        {editing ? (
          <div className="inline-flex flex-col items-stretch gap-1 text-left min-w-[150px]">
            {/* Bascule mode horaire / mensuel */}
            <div className="inline-flex self-start rounded-md border border-zinc-300 overflow-hidden text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setMode("HOURLY")}
                className={cn(
                  "px-2 py-0.5",
                  mode === "HOURLY" ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-zinc-100"
                )}
              >
                €/h
              </button>
              <button
                type="button"
                onClick={() => setMode("MONTHLY")}
                className={cn(
                  "px-2 py-0.5 border-l border-zinc-300",
                  mode === "MONTHLY" ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-zinc-100"
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
                className="w-20 rounded border border-zinc-300 px-2 py-0.5 text-right text-[12.5px] font-mono"
              />
              <input
                type="text"
                inputMode="numeric"
                value={coeff}
                onChange={(e) => setCoeff(e.target.value)}
                placeholder="Coeff."
                title="Coefficient conventionnel (optionnel — laisser vide pour estimer via l'ancienneté)"
                className="w-14 rounded border border-zinc-300 px-2 py-0.5 text-right text-[12.5px] font-mono"
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
            {compLabel(line)}
            <Pencil className="h-3 w-3 opacity-50" />
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {line.taskHoursRegular.toFixed(1)} h
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {overtime > 0 ? (
          <span title={`+25% : ${line.overtimeHours25.toFixed(1)}h, +50% : ${line.overtimeHours50.toFixed(1)}h`}>
            +{overtime.toFixed(1)} h
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
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
      <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">
        {fmt(line.grossEmployer)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700">
        {fmt(line.netEstimated)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-violet-900">
        {fmt(line.totalEmployerCost)}
      </td>
      <td className="px-3 py-2 text-center">
        {benchmark ? <BenchmarkChip benchmark={benchmark} /> : <span className="text-zinc-400">—</span>}
      </td>
    </tr>
  );
}

/* ─── Pastille de position marché / conformité ──────────────────────── */
function BenchmarkChip({ benchmark: b }: { benchmark: Benchmark }) {
  // Priorité visuelle : alerte légale d'abord (sous le minimum conventionnel).
  if (b.legal === "below_min") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-semibold text-red-700"
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
      cls: "bg-amber-100 text-amber-700",
      icon: <TrendingDown className="h-3 w-3" />,
      label: "Sous marché",
    },
    aligned: {
      cls: "bg-emerald-100 text-emerald-700",
      icon: <Minus className="h-3 w-3" />,
      label: "Aligné",
    },
    above: {
      cls: "bg-sky-100 text-sky-700",
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
