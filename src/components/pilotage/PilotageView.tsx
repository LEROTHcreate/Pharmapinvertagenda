import Link from "next/link";
import {
  Banknote,
  Clock,
  CalendarOff,
  TrendingUp,
  TrendingDown,
  Minus,
  Percent,
  ArrowRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  Flame,
} from "lucide-react";
import type { HrDashboard, HrMonthStat } from "@/lib/hr-dashboard";
import { HiringSimulator } from "@/components/payroll/HiringSimulator";
import { cn } from "@/lib/utils";

const eur = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const h = (n: number) => `${n.toLocaleString("fr-FR")} h`;
const pct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
const pct0 = (n: number) => `${Math.round(n * 100)} %`;

/**
 * Pilotage RH — cockpit STRATÉGIQUE du titulaire : tendances sur 6 mois +
 * signaux d'alerte. Volontairement complémentaire (pas de doublon) :
 *  · le détail par collaborateur vit dans Statistiques (/stats) ;
 *  · la paie mensuelle + exports vivent dans Rémunération (/remuneration).
 * Ici on ne montre que la TRAJECTOIRE et les POINTS D'ATTENTION.
 */
export function PilotageView({
  data,
  annualBudget,
  employerRate,
  currentMonth,
}: {
  data: HrDashboard;
  /** Budget annuel de masse salariale (réglé dans Paramètres) — null si absent. */
  annualBudget: number | null;
  /** Taux patronal effectif (pour le simulateur d'embauche). */
  employerRate: number;
  /** Mois courant "YYYY-MM" (SMIC de référence du simulateur). */
  currentMonth: string;
}) {
  const { months, employees } = data;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const first = months[0];
  // Projection annuelle = coût employeur du mois courant × 12 (hypothèse simple,
  // cohérente avec Rémunération).
  const annualProjection = cur.cost * 12;

  const hasRevenue = months.some((m) => m.salaryToRevenue != null);
  const maxHours = Math.max(1, ...months.map((m) => m.workedHours + m.absenceHours));
  const maxCost = Math.max(1, ...months.map((m) => m.cost));
  const maxRate = Math.max(0.02, ...months.map((m) => m.absenteeismRate));
  const maxRatio = Math.max(0.02, ...months.map((m) => m.salaryToRevenue ?? 0));

  const signals = buildSignals(months, employees);

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-6">
      {/* En-tête pleine largeur */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Pilotage RH</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Tendances et signaux sur 6 mois ({first.label} → {cur.label}) — estimations.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CrossLink href="/stats" label="Détail par collaborateur" />
          <CrossLink href="/remuneration" label="Paie du mois" />
        </div>
      </header>

      {/* KPIs — mois courant + Δ vs mois précédent */}
      <div className={cn("grid gap-3 grid-cols-2", hasRevenue ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
        <Kpi
          icon={<Banknote className="h-4 w-4" />}
          tone="emerald"
          label={`Coût employeur · ${cur.label}`}
          value={eur(cur.cost)}
          delta={prev ? deltaPct(cur.cost, prev.cost) : null}
          invertDelta
        />
        <Kpi
          icon={<Clock className="h-4 w-4" />}
          tone="violet"
          label={`Heures travaillées · ${cur.label}`}
          value={h(cur.workedHours)}
          delta={prev ? deltaPct(cur.workedHours, prev.workedHours) : null}
        />
        <Kpi
          icon={<Flame className="h-4 w-4" />}
          tone="amber"
          label={`Heures sup · ${cur.label}`}
          value={h(cur.overtimeHours)}
          delta={prev ? deltaPct(cur.overtimeHours, prev.overtimeHours) : null}
          invertDelta
        />
        <Kpi
          icon={<CalendarOff className="h-4 w-4" />}
          tone="rose"
          label={`Absentéisme · ${cur.label}`}
          value={pct(cur.absenteeismRate)}
          delta={prev ? deltaPts(cur.absenteeismRate, prev.absenteeismRate) : null}
          invertDelta
        />
        {hasRevenue && (
          <Kpi
            icon={<Percent className="h-4 w-4" />}
            tone="blue"
            label={`Masse sal. / CA · ${cur.label}`}
            value={cur.salaryToRevenue != null ? pct(cur.salaryToRevenue) : "—"}
            delta={
              prev && cur.salaryToRevenue != null && prev.salaryToRevenue != null
                ? deltaPts(cur.salaryToRevenue, prev.salaryToRevenue)
                : null
            }
            invertDelta
          />
        )}
      </div>

      {/* Points d'attention — le cœur du cockpit */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Points d'attention
        </h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {signals.map((s, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px]",
                SIGNAL_STYLE[s.tone]
              )}
            >
              <span className="mt-0.5 shrink-0">{SIGNAL_ICON[s.tone]}</span>
              <span className="leading-snug">{s.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Tendances — pleine largeur, 2 colonnes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Heures par mois" hint="Travaillées (violet) · heures sup (ambre) · absences subies (rose)">
          <Bars
            months={months}
            height={150}
            render={(m) => {
              const regular = Math.max(0, m.workedHours - m.overtimeHours);
              const seg = (v: number) => Math.round((v / maxHours) * 150);
              return (
                <div
                  className="flex w-full max-w-[46px] flex-col-reverse overflow-hidden rounded-md"
                  style={{ height: 150 }}
                  title={`${m.label} — ${h(m.workedHours)} (dont ${h(m.overtimeHours)} sup), ${h(m.absenceHours)} absence`}
                >
                  <div className="bg-violet-500" style={{ height: seg(regular) }} />
                  <div className="bg-amber-400" style={{ height: seg(m.overtimeHours) }} />
                  <div className="bg-rose-400" style={{ height: seg(m.absenceHours) }} />
                </div>
              );
            }}
          />
        </Panel>

        <Panel title="Coût employeur par mois" hint="Estimation (brut + charges patronales)">
          <Bars
            months={months}
            height={150}
            topLabel={(m) => `${Math.round(m.cost / 1000)}k`}
            render={(m) => (
              <div
                className="w-full max-w-[46px] rounded-md bg-emerald-500"
                style={{ height: Math.max(2, Math.round((m.cost / maxCost) * 132)) }}
                title={`${m.label} — ${eur(m.cost)}`}
              />
            )}
          />
        </Panel>

        <Panel title="Taux d'absentéisme" hint="Maladie + absences injustifiées / heures totales">
          <Bars
            months={months}
            height={110}
            topLabel={(m) => pct0(m.absenteeismRate)}
            render={(m) => (
              <div
                className={cn(
                  "w-full max-w-[46px] rounded-md",
                  m.absenteeismRate >= 0.08 ? "bg-rose-500" : "bg-rose-300"
                )}
                style={{ height: Math.max(2, Math.round((m.absenteeismRate / maxRate) * 92)) }}
                title={`${m.label} — ${pct(m.absenteeismRate)}`}
              />
            )}
          />
        </Panel>

        {hasRevenue ? (
          <Panel title="Masse salariale / CA" hint="Coût employeur rapporté au chiffre d'affaires HT">
            <Bars
              months={months}
              height={110}
              topLabel={(m) => (m.salaryToRevenue != null ? pct0(m.salaryToRevenue) : "—")}
              render={(m) =>
                m.salaryToRevenue != null ? (
                  <div
                    className="w-full max-w-[46px] rounded-md bg-blue-500"
                    style={{ height: Math.max(2, Math.round((m.salaryToRevenue / maxRatio) * 92)) }}
                    title={`${m.label} — ${pct(m.salaryToRevenue)} (CA ${m.revenueHT ? eur(m.revenueHT) : "?"})`}
                  />
                ) : (
                  <div className="w-full max-w-[46px] rounded-md bg-muted" style={{ height: 4 }} />
                )
              }
            />
          </Panel>
        ) : (
          <Panel title="Masse salariale / CA" hint="Suivi du poids de la paie dans le chiffre d'affaires">
            <div className="flex h-[110px] flex-col items-center justify-center gap-2 text-center">
              <p className="max-w-xs text-[13px] text-muted-foreground">
                Renseigne le chiffre d'affaires mensuel dans Rémunération pour suivre ce ratio
                clé de pilotage.
              </p>
              <Link
                href="/remuneration"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
              >
                Saisir le CA <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Panel>
        )}
      </div>

      {/* ─── Prévisionnel & décisions ─────────────────────────────────
          Projection annuelle vs budget + simulateur d'embauche. Regroupés ici
          (décisions stratégiques) plutôt que dans Rémunération (paie du mois). */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Percent className="h-4 w-4 text-violet-500" /> Prévisionnel &amp; décisions
        </h2>

        {/* Projection annuelle vs budget */}
        {annualBudget != null && annualBudget > 0 ? (
          (() => {
            const over = annualProjection > annualBudget;
            const ratio = Math.round((annualProjection / annualBudget) * 100);
            const gap = Math.abs(annualProjection - annualBudget);
            return (
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border px-4 py-3 text-[13px]",
                  over
                    ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
                )}
              >
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  {over ? (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  )}
                  Budget annuel : {eur(annualBudget)}
                </span>
                <span className="tabular-nums">
                  Projection {eur(annualProjection)} ·{" "}
                  {over ? "dérive projetée" : "marge"} :{" "}
                  <strong>
                    {over ? "+" : "−"}
                    {eur(gap)}
                  </strong>{" "}
                  <span className="opacity-75">({ratio} % du budget)</span>
                </span>
              </div>
            );
          })()
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-[13px]">
            <span className="text-muted-foreground">
              Projection annuelle ≈{" "}
              <strong className="tabular-nums text-foreground">
                {eur(annualProjection)}
              </strong>{" "}
              (coût du mois × 12). Définis un budget annuel pour suivre la dérive.
            </span>
            <Link
              href="/parametres"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
            >
              Définir le budget <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Simulateur d'embauche */}
        <HiringSimulator
          month={currentMonth}
          employerRate={employerRate}
          currentAnnualProjection={annualProjection}
          annualBudget={annualBudget}
        />
      </section>

      <p className="text-[11px] text-muted-foreground/70">
        Chiffres estimatifs (planning + réglages de paie, mêmes hypothèses que Rémunération).
        Le détail par collaborateur est dans{" "}
        <Link href="/stats" className="underline hover:text-foreground">Statistiques</Link>, la
        paie mensuelle dans{" "}
        <Link href="/remuneration" className="underline hover:text-foreground">Rémunération</Link>.
      </p>
    </div>
  );
}

/* ─── Signaux (points d'attention) ─────────────────────────────── */
type Signal = { tone: "critical" | "warning" | "info" | "positive"; text: string };

const SIGNAL_STYLE: Record<Signal["tone"], string> = {
  critical: "border-rose-200 bg-rose-50/60 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200",
  warning: "border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200",
  info: "border-blue-200 bg-blue-50/60 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200",
  positive: "border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200",
};
const SIGNAL_ICON: Record<Signal["tone"], React.ReactNode> = {
  critical: <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  info: <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
  positive: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
};

function buildSignals(months: HrMonthStat[], employees: HrDashboard["employees"]): Signal[] {
  const out: Signal[] = [];
  const cur = months[months.length - 1];
  const prior = months.slice(0, -1);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

  // Absentéisme du mois courant
  if (cur.absenteeismRate >= 0.08) {
    out.push({
      tone: cur.absenteeismRate >= 0.12 ? "critical" : "warning",
      text: `Absentéisme élevé en ${cur.label} : ${pct(cur.absenteeismRate)} (maladie + absences injustifiées).`,
    });
  }

  // Heures sup : mois courant vs moyenne des mois précédents
  const avgPriorHS = avg(prior.map((m) => m.overtimeHours));
  if (cur.overtimeHours >= 8 && avgPriorHS > 0 && cur.overtimeHours > avgPriorHS * 1.3) {
    out.push({
      tone: "warning",
      text: `Heures sup en hausse : ${h(cur.overtimeHours)} en ${cur.label}, contre ~${h(Math.round(avgPriorHS))} en moyenne les mois précédents.`,
    });
  }

  // Coût : tendance 6 mois
  const firstCost = months[0].cost;
  if (firstCost > 0) {
    const d = (cur.cost - firstCost) / firstCost;
    if (d >= 0.1)
      out.push({
        tone: "info",
        text: `Coût employeur en progression : ${deltaPct(cur.cost, firstCost).text} sur 6 mois (${eur(firstCost)} → ${eur(cur.cost)}).`,
      });
    else if (d <= -0.1)
      out.push({
        tone: "positive",
        text: `Coût employeur en baisse de ${Math.abs(Math.round(d * 100))} % sur 6 mois.`,
      });
  }

  // Ratio masse salariale / CA
  if (cur.salaryToRevenue != null) {
    out.push({
      tone: cur.salaryToRevenue >= 0.16 ? "warning" : "info",
      text: `Masse salariale = ${pct(cur.salaryToRevenue)} du CA en ${cur.label}.`,
    });
  }

  // Top heures sup cumulées (signal, PAS un tableau — le détail est dans /stats)
  const topHS = [...employees].sort((a, b) => b.overtimeHours - a.overtimeHours)[0];
  if (topHS && topHS.overtimeHours >= 12) {
    out.push({
      tone: "info",
      text: `${topHS.name} cumule ${h(topHS.overtimeHours)} d'heures sup sur la période — à surveiller.`,
    });
  }

  if (out.length === 0)
    out.push({ tone: "positive", text: "Indicateurs stables : rien de préoccupant sur les 6 derniers mois. 👍" });

  return out;
}

/* ─── UI helpers ───────────────────────────────────────────────── */
function Bars({
  months,
  height,
  render,
  topLabel,
}: {
  months: HrMonthStat[];
  height: number;
  render: (m: HrMonthStat) => React.ReactNode;
  topLabel?: (m: HrMonthStat) => string;
}) {
  return (
    <div className="flex items-end justify-between gap-2 pt-2">
      {months.map((m) => (
        <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-col items-center justify-end" style={{ height }}>
            {topLabel && (
              <span className="mb-0.5 text-[9.5px] font-medium tabular-nums text-muted-foreground">
                {topLabel(m)}
              </span>
            )}
            {render(m)}
          </div>
          <span className="text-[10.5px] capitalize text-muted-foreground">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function CrossLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium text-foreground/80 transition-colors hover:bg-muted/50"
    >
      {label} <ArrowRight className="h-3.5 w-3.5 opacity-60" />
    </Link>
  );
}

function deltaPct(cur: number, prev: number): { text: string; dir: "up" | "down" | "flat" } {
  if (prev === 0) return { text: cur > 0 ? "nouveau" : "—", dir: cur > 0 ? "up" : "flat" };
  const d = (cur - prev) / prev;
  if (Math.abs(d) < 0.005) return { text: "stable", dir: "flat" };
  return { text: `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)} %`, dir: d > 0 ? "up" : "down" };
}
function deltaPts(cur: number, prev: number): { text: string; dir: "up" | "down" | "flat" } {
  const d = (cur - prev) * 100;
  if (Math.abs(d) < 0.1) return { text: "stable", dir: "flat" };
  return { text: `${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} pt`, dir: d > 0 ? "up" : "down" };
}

const KPI_TONE: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
};

function Kpi({
  icon,
  tone,
  label,
  value,
  delta,
  invertDelta = false,
}: {
  icon: React.ReactNode;
  tone: keyof typeof KPI_TONE;
  label: string;
  value: string;
  delta: { text: string; dir: "up" | "down" | "flat" } | null;
  invertDelta?: boolean;
}) {
  const dirColor =
    !delta || delta.dir === "flat"
      ? "text-muted-foreground"
      : (delta.dir === "up") !== invertDelta
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";
  const DirIcon = !delta || delta.dir === "flat" ? Minus : delta.dir === "up" ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", KPI_TONE[tone])}>
          {icon}
        </span>
      </div>
      <div className="mt-1.5 font-mono text-[22px] font-semibold tabular-nums leading-none text-foreground">
        {value}
      </div>
      {delta && (
        <div className={cn("mt-1.5 flex items-center gap-1 text-[11.5px] font-medium", dirColor)}>
          <DirIcon className="h-3.5 w-3.5" />
          {delta.text} <span className="text-muted-foreground/70">vs préc.</span>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="mb-1">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
