"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarOff,
  Clock,
  Download,
  Scale,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/types";
import type { EmployeeStat, PeriodTotals, StatsPeriod } from "@/lib/stats";
import type { EmployeeStatus } from "@prisma/client";

type Props = {
  period: StatsPeriod;
  periodLabel: string;
  employees: EmployeeStat[];
  /** Totaux de la période précédente (null si "tout l'historique"). */
  previous: PeriodTotals | null;
};

// Taux brut horaire moyen SUPPOSÉ pour l'estimation du coût des heures sup.
// Volontairement indépendant des salaires réels (module Rémunération) → c'est
// une estimation "ordre de grandeur" affichée comme telle.
const ASSUMED_GROSS_HOURLY = 14;

const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
  { value: "semester", label: "Semestre" },
  { value: "all", label: "Tout" },
];

// ─── Tonalité de charge (vs contrat hebdo) ─────────────────────────
type Tone = "over" | "on" | "under" | "neutral";

/** Compare une moyenne hebdo (ou une semaine isolée) au contrat. */
function getTone(weeklyHours: number, contract: number, hasData: boolean): Tone {
  if (!hasData || contract === 0 || weeklyHours === 0) return "neutral";
  if (weeklyHours > contract + 0.5) return "over"; // HS → rouge
  if (weeklyHours < contract - 0.5) return "under"; // sous-emploi → orange
  return "on"; // au contrat → vert
}

const TONE_BADGE: Record<Tone, string> = {
  over: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  on: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  under: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  neutral: "bg-zinc-50 text-zinc-500 ring-1 ring-inset ring-zinc-200",
};

const TONE_BAR_FILL: Record<Tone, string> = {
  over: "bg-rose-500",
  on: "bg-emerald-500",
  under: "bg-amber-500",
  neutral: "bg-zinc-300",
};

const TONE_SVG_FILL: Record<Tone, string> = {
  over: "rgb(244 63 94 / 0.85)",
  on: "rgb(16 185 129 / 0.85)",
  under: "rgb(245 158 11 / 0.85)",
  neutral: "rgb(212 212 216 / 0.7)",
};

// ─── Mini bar-chart : barres colorées par tonalité hebdo ──────────
function MiniBarChart({
  data,
  contractHours,
}: {
  data: Array<{ weekStart: string; taskHours: number }>;
  contractHours: number;
}) {
  if (data.length === 0) {
    return (
      <span className="text-[11px] italic text-zinc-300">— pas de données</span>
    );
  }
  const max = Math.max(contractHours * 1.2, ...data.map((d) => d.taskHours), 1);
  const W = 120;
  const H = 28;
  const barW = Math.max(2, W / data.length - 1);
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="overflow-visible"
      role="img"
      aria-label={`Heures par semaine sur ${data.length} semaine(s)`}
    >
      {/* Ligne contrat hebdo (référence) */}
      <line
        x1={0}
        y1={H - (contractHours / max) * H}
        x2={W}
        y2={H - (contractHours / max) * H}
        stroke="rgb(244 114 182 / 0.5)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      {data.map((d, i) => {
        const h = (d.taskHours / max) * H;
        const tone = getTone(d.taskHours, contractHours, d.taskHours > 0);
        return (
          <rect
            key={d.weekStart}
            x={i * (barW + 1)}
            y={H - h}
            width={barW}
            height={Math.max(h, 1)}
            fill={TONE_SVG_FILL[tone]}
            rx={1}
          >
            <title>{`${d.weekStart} : ${d.taskHours.toFixed(1)}h`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ─── Courbe d'évolution de la charge équipe ───────────────────────
function TeamTrendChart({
  data,
}: {
  data: Array<{ weekStart: string; hours: number }>;
}) {
  const W = 600;
  const H = 90;
  const pad = 6;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.hours));
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (h: number) => H - pad - (h / max) * (H - 2 * pad);
  const linePts = data.map((d, i) => `${x(i)},${y(d.hours)}`).join(" ");
  const areaPts = `${x(0)},${H - pad} ${linePts} ${x(n - 1)},${H - pad}`;
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-24"
        role="img"
        aria-label="Évolution des heures planifiées de l'équipe par semaine"
      >
        <polygon points={areaPts} fill="rgb(124 58 237 / 0.10)" />
        <polyline
          points={linePts}
          fill="none"
          stroke="rgb(124 58 237)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 tabular-nums">
        <span>{fmt(data[0].weekStart)}</span>
        <span className="text-zinc-500">
          max {max.toFixed(0)}h · {data.length} sem.
        </span>
        <span>{fmt(data[n - 1].weekStart)}</span>
      </div>
    </div>
  );
}

// ─── Barre de progression : avg vs contrat ────────────────────────
function ContractProgress({
  avg,
  contract,
  tone,
}: {
  avg: number;
  contract: number;
  tone: Tone;
}) {
  if (contract === 0) {
    return <div className="h-1.5 w-full rounded-full bg-zinc-100" />;
  }
  // 0 % ←→ 130 % du contrat (au-delà = barre pleine, code couleur dit le reste)
  const pct = Math.max(0, Math.min(100, (avg / (contract * 1.3)) * 100));
  const contractMark = (1 / 1.3) * 100; // position du repère "contrat"
  return (
    <div
      className="relative h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden"
      title={`Moyenne hebdo : ${avg.toFixed(1)}h / contrat ${contract}h`}
    >
      <div
        className={cn("h-full rounded-full transition-all", TONE_BAR_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
      {/* Repère contrat */}
      <span
        aria-hidden
        className="absolute top-0 h-full w-px bg-pink-400/60"
        style={{ left: `${contractMark}%` }}
      />
    </div>
  );
}

// ─── Tri ──────────────────────────────────────────────────────────
type SortKey =
  | "name"
  | "status"
  | "weeklyHours"
  | "taskHours"
  | "avgWeeklyHours"
  | "overtimeHours"
  | "absenceHours"
  | "hsAbsBalance";

type SortDir = "asc" | "desc";

function SortHeader({
  label,
  align,
  sortKey,
  current,
  direction,
  onSort,
}: {
  label: string;
  align: "left" | "right";
  sortKey: SortKey;
  current: SortKey;
  direction: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className={cn(
        "px-3 py-2.5 font-medium select-none cursor-pointer hover:text-zinc-700",
        align === "left" ? "text-left" : "text-right"
      )}
      onClick={() => onSort(sortKey)}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <span className="inline-flex items-center gap-1">
        {align === "right" && active && (
          <span className="text-[9px] text-zinc-400">
            {direction === "asc" ? "▲" : "▼"}
          </span>
        )}
        {label}
        {align === "left" && active && (
          <span className="text-[9px] text-zinc-400">
            {direction === "asc" ? "▲" : "▼"}
          </span>
        )}
      </span>
    </th>
  );
}

// ─── Vue principale ────────────────────────────────────────────────
export function StatsView({ period, periodLabel, employees, previous }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<EmployeeStatus>>(
    new Set()
  );
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function setPeriod(p: StatsPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", p);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" || k === "status" ? "asc" : "desc");
    }
  }

  function toggleStatus(s: EmployeeStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // Statuts effectivement présents → on évite d'afficher des chips inutiles
  const availableStatuses = useMemo(() => {
    const seen = new Set<EmployeeStatus>();
    for (const e of employees) seen.add(e.status);
    return Array.from(seen);
  }, [employees]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = employees.filter((e) => {
      if (statusFilter.size > 0 && !statusFilter.has(e.status)) return false;
      if (!q) return true;
      const full = `${e.firstName} ${e.lastName}`.toLowerCase();
      return full.includes(q);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const collator = new Intl.Collator("fr", { sensitivity: "base" });
    filtered.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return (
            collator.compare(a.firstName, b.firstName) * dir ||
            collator.compare(a.lastName, b.lastName) * dir
          );
        case "status":
          return collator.compare(a.status, b.status) * dir;
        case "weeklyHours":
          return (a.weeklyHours - b.weeklyHours) * dir;
        case "taskHours":
          return (a.taskHours - b.taskHours) * dir;
        case "avgWeeklyHours":
          return (a.avgWeeklyHours - b.avgWeeklyHours) * dir;
        case "overtimeHours":
          return (a.overtimeHours - b.overtimeHours) * dir;
        case "absenceHours":
          return (a.absenceHours - b.absenceHours) * dir;
        case "hsAbsBalance":
          return (a.hsAbsBalance - b.hsAbsBalance) * dir;
        default:
          return 0;
      }
    });
    return filtered;
  }, [employees, search, statusFilter, sortKey, sortDir]);

  const totals = useMemo(
    () =>
      employees.reduce(
        (acc, e) => {
          acc.task += e.taskHours;
          acc.absence += e.absenceHours;
          acc.overtime += e.overtimeHours;
          if (e.weekCount > 0 && e.avgWeeklyHours > e.weeklyHours + 0.5) {
            acc.overContract += 1;
          }
          if (e.weekCount > 0 && e.avgWeeklyHours < e.weeklyHours - 0.5) {
            acc.underContract += 1;
          }
          return acc;
        },
        { task: 0, absence: 0, overtime: 0, overContract: 0, underContract: 0 }
      ),
    [employees]
  );

  // Coût indicatif des heures sup. (estimation ordre de grandeur) :
  // heures × taux brut supposé × 1,25 (majoration légale HS).
  const overtimeCost = Math.round(totals.overtime * ASSUMED_GROSS_HOURLY * 1.25);

  // Série hebdo agrégée équipe (somme des heures planifiées par semaine) →
  // courbe d'évolution de la charge globale.
  const teamWeekly = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      for (const w of e.weekly) {
        map.set(w.weekStart, (map.get(w.weekStart) ?? 0) + w.taskHours);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, hours]) => ({ weekStart, hours }));
  }, [employees]);

  // ─── Points d'attention : highlights auto pour les dirigeants ──────
  // On surface les cas extrêmes utiles à un titulaire : qui accumule le plus
  // d'HS (coût + fatigue), qui est le plus sous-employé (optimisation), qui a
  // le plus d'absences, et le plus gros solde HS-Abs à régulariser.
  const insights = useMemo(() => {
    const withData = employees.filter((e) => e.weekCount > 0);
    const maxBy = (
      list: EmployeeStat[],
      fn: (e: EmployeeStat) => number
    ): EmployeeStat | null =>
      list.length === 0
        ? null
        : list.reduce((best, e) => (fn(e) > fn(best) ? e : best));

    const topOvertime = maxBy(
      employees.filter((e) => e.overtimeHours > 0.5),
      (e) => e.overtimeHours
    );
    const mostUnderused = maxBy(
      withData.filter((e) => e.weeklyHours - e.avgWeeklyHours > 0.5),
      (e) => e.weeklyHours - e.avgWeeklyHours
    );
    const mostAbsence = maxBy(
      employees.filter((e) => e.absenceHours > 0.5),
      (e) => e.absenceHours
    );
    const topBalance = maxBy(
      employees.filter((e) => Math.abs(e.hsAbsBalance) > 0.5),
      (e) => Math.abs(e.hsAbsBalance)
    );
    return { topOvertime, mostUnderused, mostAbsence, topBalance };
  }, [employees]);

  function exportCSV() {
    const header = [
      "Prénom",
      "Nom",
      "Statut",
      "Contrat hebdo (h)",
      "Planifié (h)",
      "Moyenne hebdo (h)",
      "Heures sup. (h)",
      "Absences (h)",
      "Solde HS-Abs (h)",
      "Semaines actives",
    ];
    const rows = filteredSorted.map((e) => [
      e.firstName,
      e.lastName,
      STATUS_LABELS[e.status],
      e.weeklyHours.toString(),
      e.taskHours.toFixed(1),
      e.avgWeeklyHours.toFixed(1),
      e.overtimeHours.toFixed(1),
      e.absenceHours.toFixed(1),
      e.hsAbsBalance.toFixed(1),
      e.weekCount.toString(),
    ]);
    const escape = (s: string) =>
      /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const csv = [header, ...rows]
      .map((r) => r.map((c) => escape(String(c))).join(";"))
      .join("\n");
    // BOM pour Excel-FR
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-3 md:p-4 space-y-5">
      {/* En-tête + sélecteur */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            Statistiques
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">
            {periodLabel}
          </p>
        </div>
        <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={cn(
                "h-8 px-3 rounded-full text-[12.5px] font-medium transition-colors",
                period === opt.value
                  ? "bg-violet-100 text-violet-700"
                  : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards résumé équipe */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={Clock}
          label="Heures planifiées"
          value={`${totals.task.toFixed(0)}h`}
          hint="cumul équipe sur la période"
          tone="violet"
          delta={
            previous
              ? { current: totals.task, previous: previous.task, badWhenUp: false }
              : null
          }
        />
        <SummaryCard
          icon={TrendingUp}
          label="Heures supplémentaires"
          value={`${totals.overtime.toFixed(0)}h`}
          hint={
            overtimeCost > 0
              ? `≈ ${overtimeCost.toLocaleString("fr-FR")} € estimé (≈${ASSUMED_GROSS_HOURLY} €/h × 1,25)`
              : "au-delà du contrat hebdo"
          }
          tone="rose"
          delta={
            previous
              ? { current: totals.overtime, previous: previous.overtime, badWhenUp: true }
              : null
          }
        />
        <SummaryCard
          icon={CalendarOff}
          label="Heures d'absence"
          value={`${totals.absence.toFixed(0)}h`}
          hint="congés, maladie, formations…"
          tone="amber"
          delta={
            previous
              ? { current: totals.absence, previous: previous.absence, badWhenUp: true }
              : null
          }
        />
        <SummaryCard
          icon={Users}
          label="Charge équipe"
          value={`${totals.overContract} / ${totals.underContract}`}
          hint="au-dessus / sous le contrat"
          tone="emerald"
          delta={null}
        />
      </div>

      {/* Points d'attention — highlights dirigeants */}
      {(insights.topOvertime ||
        insights.mostUnderused ||
        insights.mostAbsence ||
        insights.topBalance) && (
        <div>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
            Points d&apos;attention
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {insights.topOvertime && (
              <InsightCard
                icon={TrendingUp}
                tone="rose"
                label="Plus d'heures sup."
                emp={insights.topOvertime}
                value={`+${insights.topOvertime.overtimeHours.toFixed(0)}h`}
              />
            )}
            {insights.mostUnderused && (
              <InsightCard
                icon={TrendingDown}
                tone="amber"
                label="Plus sous-employé"
                emp={insights.mostUnderused}
                value={`−${(
                  insights.mostUnderused.weeklyHours -
                  insights.mostUnderused.avgWeeklyHours
                ).toFixed(1)}h/sem`}
              />
            )}
            {insights.mostAbsence && (
              <InsightCard
                icon={CalendarOff}
                tone="amber"
                label="Plus d'absences"
                emp={insights.mostAbsence}
                value={`${insights.mostAbsence.absenceHours.toFixed(0)}h`}
              />
            )}
            {insights.topBalance && (
              <InsightCard
                icon={Scale}
                tone="violet"
                label="Plus gros solde HS-Abs"
                emp={insights.topBalance}
                value={`${insights.topBalance.hsAbsBalance > 0 ? "+" : ""}${insights.topBalance.hsAbsBalance.toFixed(0)}h`}
              />
            )}
          </div>
        </div>
      )}

      {/* Évolution de la charge équipe (semaine par semaine) */}
      {teamWeekly.length >= 2 && (
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
              Évolution de la charge équipe
            </h2>
            <span className="text-[11px] text-zinc-400">
              heures planifiées / semaine
            </span>
          </div>
          <TeamTrendChart data={teamWeekly} />
        </div>
      )}

      {/* Détail par collaborateur */}
      {employees.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground">
          Aucun collaborateur actif sur cette période.
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 bg-white overflow-hidden">
          {/* Barre d'outils : recherche + filtre statut + export */}
          <div className="border-b bg-zinc-50/50 px-3 py-2 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un prénom…"
                aria-label="Rechercher un collaborateur"
                className="h-8 rounded-md border border-zinc-200 bg-white pl-8 pr-2.5 text-[12.5px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-200 w-44"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {availableStatuses.map((s) => {
                const active = statusFilter.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={cn(
                      "h-7 px-2.5 rounded-full text-[11.5px] font-medium border transition-colors",
                      active
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                    )}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
              {statusFilter.size > 0 && (
                <button
                  onClick={() => setStatusFilter(new Set())}
                  className="h-7 px-2 rounded-full text-[11.5px] text-zinc-500 hover:text-zinc-700"
                >
                  Effacer
                </button>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11.5px] text-zinc-500">
                {filteredSorted.length} / {employees.length}
              </span>
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-200 bg-white text-[12.5px] font-medium text-zinc-700 hover:bg-zinc-100"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              aria-label="Statistiques par collaborateur"
            >
              <thead className="bg-zinc-50/70 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <SortHeader
                    label="Collaborateur"
                    align="left"
                    sortKey="name"
                    current={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Statut"
                    align="left"
                    sortKey="status"
                    current={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Contrat"
                    align="right"
                    sortKey="weeklyHours"
                    current={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Planifié"
                    align="right"
                    sortKey="taskHours"
                    current={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Moy. hebdo"
                    align="right"
                    sortKey="avgWeeklyHours"
                    current={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="HS cumul."
                    align="right"
                    sortKey="overtimeHours"
                    current={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Absences"
                    align="right"
                    sortKey="absenceHours"
                    current={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    label="Solde HS-Abs"
                    align="right"
                    sortKey="hsAbsBalance"
                    current={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <th className="px-3 py-2.5 text-right font-medium">
                    Évolution hebdo
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((s) => {
                  const tone = getTone(
                    s.avgWeeklyHours,
                    s.weeklyHours,
                    s.weekCount > 0
                  );
                  const balanceTone =
                    Math.abs(s.hsAbsBalance) < 0.5
                      ? "text-zinc-500"
                      : s.hsAbsBalance > 0
                        ? "text-rose-600"
                        : "text-emerald-700";
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-zinc-100 even:bg-zinc-50/40 hover:bg-violet-50/40 transition-colors"
                    >
                      <td className="px-4 py-2 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: s.displayColor }}
                          />
                          {s.firstName} {s.lastName}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-[12px]">
                        {STATUS_LABELS[s.status]}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-500 tabular-nums">
                        {s.weeklyHours}h
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center rounded-md px-2 py-0.5 font-mono tabular-nums text-[12.5px]",
                            TONE_BADGE[tone]
                          )}
                          title={
                            tone === "over"
                              ? "Au-dessus du contrat (heures supp.)"
                              : tone === "under"
                                ? "Sous le contrat hebdo"
                                : tone === "on"
                                  ? "Au contrat hebdo"
                                  : "Pas de données"
                          }
                        >
                          {s.taskHours.toFixed(1)}h
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono tabular-nums text-[12.5px] text-zinc-600 w-12 text-right">
                            {s.weekCount > 0
                              ? `${s.avgWeeklyHours.toFixed(1)}h`
                              : "—"}
                          </span>
                          <div className="w-20">
                            <ContractProgress
                              avg={s.avgWeeklyHours}
                              contract={s.weeklyHours}
                              tone={tone}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-rose-600">
                        {s.overtimeHours > 0
                          ? `+${s.overtimeHours.toFixed(1)}h`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-700">
                        {s.absenceHours > 0
                          ? `${s.absenceHours.toFixed(1)}h`
                          : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono font-semibold tabular-nums",
                          balanceTone
                        )}
                        title="Heures supplémentaires cumulées − heures d'absence cumulées"
                      >
                        {s.hsAbsBalance > 0 ? "+" : ""}
                        {s.hsAbsBalance.toFixed(1)}h
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MiniBarChart
                          data={s.weekly}
                          contractHours={s.weeklyHours}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t bg-zinc-50/40 px-4 py-2 flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
              Au contrat
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
              Sous le contrat
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-rose-500" />
              Heures supp.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-px w-3 bg-pink-400 border-t border-dashed border-pink-400" />
              Repère contrat hebdo
            </span>
            <span className="text-zinc-400">
              <strong className="font-semibold text-zinc-500">Solde HS-Abs</strong> = heures
              supplémentaires cumulées − heures d&apos;absence cumulées
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const TONE_CARD: Record<
  "violet" | "rose" | "amber" | "emerald",
  { card: string; value: string; chip: string }
> = {
  violet: {
    card: "border-violet-200/70 bg-violet-50/40",
    value: "text-violet-700",
    chip: "bg-violet-100 text-violet-700",
  },
  rose: {
    card: "border-rose-200/70 bg-rose-50/40",
    value: "text-rose-700",
    chip: "bg-rose-100 text-rose-700",
  },
  amber: {
    card: "border-amber-200/70 bg-amber-50/40",
    value: "text-amber-700",
    chip: "bg-amber-100 text-amber-700",
  },
  emerald: {
    card: "border-emerald-200/70 bg-emerald-50/40",
    value: "text-emerald-700",
    chip: "bg-emerald-100 text-emerald-700",
  },
};

/** Badge d'évolution vs période précédente (↑/↓ %). */
function DeltaBadge({
  current,
  previous,
  badWhenUp,
}: {
  current: number;
  previous: number;
  badWhenUp: boolean;
}) {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) {
    return (
      <span className="text-[11px] font-medium text-zinc-400">≈ stable</span>
    );
  }
  const up = pct > 0;
  const bad = up === badWhenUp;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
        bad ? "text-rose-600" : "text-emerald-600"
      )}
      title="vs période précédente"
    >
      {up ? "↑" : "↓"}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: "violet" | "rose" | "amber" | "emerald";
  delta: { current: number; previous: number; badWhenUp: boolean } | null;
}) {
  const t = TONE_CARD[tone];
  return (
    <div className={cn("rounded-2xl border p-4", t.card)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide font-medium text-zinc-500">
          {label}
        </p>
        <span
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            t.chip
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={cn("text-2xl font-bold font-mono tabular-nums", t.value)}>
          {value}
        </p>
        {delta && (
          <DeltaBadge
            current={delta.current}
            previous={delta.previous}
            badWhenUp={delta.badWhenUp}
          />
        )}
      </div>
      <p className="text-[11px] text-zinc-500 mt-0.5">{hint}</p>
    </div>
  );
}

/** Carte « point d'attention » : met en avant un collaborateur extrême. */
function InsightCard({
  icon: Icon,
  tone,
  label,
  emp,
  value,
}: {
  icon: LucideIcon;
  tone: "violet" | "rose" | "amber" | "emerald";
  label: string;
  emp: EmployeeStat;
  value: string;
}) {
  const t = TONE_CARD[tone];
  return (
    <div className="rounded-xl border border-zinc-200/70 bg-white p-3.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
            t.chip
          )}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </p>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: emp.displayColor }}
          />
          <span className="truncate text-[14px] font-semibold tracking-tight text-zinc-900">
            {emp.firstName}
          </span>
        </span>
        <span className={cn("font-mono text-[15px] font-bold tabular-nums", t.value)}>
          {value}
        </span>
      </div>
    </div>
  );
}
