"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/types";
import type { EmployeeStat, StatsPeriod } from "@/lib/stats";

type Props = {
  period: StatsPeriod;
  periodLabel: string;
  employees: EmployeeStat[];
};

const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
  { value: "semester", label: "Semestre" },
  { value: "all", label: "Tout" },
];

/** Mini bar-chart inline SVG : heures planifiées par semaine sur la période. */
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
        const overtime = d.taskHours > contractHours;
        return (
          <rect
            key={d.weekStart}
            x={i * (barW + 1)}
            y={H - h}
            width={barW}
            height={h}
            fill={overtime ? "rgb(244 63 94 / 0.85)" : "rgb(139 92 246 / 0.85)"}
            rx={1}
          >
            <title>{`${d.weekStart} : ${d.taskHours.toFixed(1)}h`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function StatsView({ period, periodLabel, employees }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setPeriod(p: StatsPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", p);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const totals = employees.reduce(
    (acc, e) => {
      acc.task += e.taskHours;
      acc.absence += e.absenceHours;
      acc.overtime += e.overtimeHours;
      return acc;
    },
    { task: 0, absence: 0, overtime: 0 }
  );

  return (
    <div className="p-4 md:p-6 space-y-5">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Heures planifiées"
          value={`${totals.task.toFixed(0)}h`}
          hint="cumul équipe sur la période"
          tone="violet"
        />
        <SummaryCard
          label="Heures supplémentaires"
          value={`${totals.overtime.toFixed(0)}h`}
          hint="au-delà du contrat hebdo"
          tone="rose"
        />
        <SummaryCard
          label="Heures d'absence"
          value={`${totals.absence.toFixed(0)}h`}
          hint="congés, maladie, formations…"
          tone="amber"
        />
      </div>

      {/* Détail par collaborateur */}
      {employees.length === 0 ? (
        <div className="rounded-2xl border bg-white p-12 text-center text-sm text-muted-foreground">
          Aucun collaborateur actif sur cette période.
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50/70 text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Collaborateur</th>
                <th className="px-3 py-2.5 text-left font-medium">Statut</th>
                <th className="px-3 py-2.5 text-right font-medium">Contrat</th>
                <th className="px-3 py-2.5 text-right font-medium">Planifié</th>
                <th className="px-3 py-2.5 text-right font-medium">HS cumul.</th>
                <th className="px-3 py-2.5 text-right font-medium">Absences</th>
                <th className="px-3 py-2.5 text-right font-medium">Solde HS-Abs</th>
                <th className="px-3 py-2.5 text-right font-medium">Évolution hebdo</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((s) => {
                const balanceTone =
                  Math.abs(s.hsAbsBalance) < 0.5
                    ? "text-zinc-500"
                    : s.hsAbsBalance > 0
                      ? "text-rose-600"
                      : "text-emerald-700";
                return (
                  <tr key={s.id} className="border-t hover:bg-zinc-50/40">
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
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {s.taskHours.toFixed(1)}h
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
          <div className="border-t bg-zinc-50/40 px-4 py-2 flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-violet-500" />
              Sous le contrat
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-rose-500" />
              Heures supp.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-px w-3 bg-pink-400 border-t border-dashed border-pink-400" />
              Contrat hebdo
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "violet" | "rose" | "amber";
}) {
  const toneClasses = {
    violet: "border-violet-200/70 bg-violet-50/40",
    rose: "border-rose-200/70 bg-rose-50/40",
    amber: "border-amber-200/70 bg-amber-50/40",
  }[tone];
  const valueClasses = {
    violet: "text-violet-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
  }[tone];
  return (
    <div className={cn("rounded-2xl border p-4", toneClasses)}>
      <p className="text-[11px] uppercase tracking-wide font-medium text-zinc-500">
        {label}
      </p>
      <p
        className={cn(
          "text-2xl font-bold font-mono mt-1 tabular-nums",
          valueClasses
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-zinc-500 mt-0.5">{hint}</p>
    </div>
  );
}
