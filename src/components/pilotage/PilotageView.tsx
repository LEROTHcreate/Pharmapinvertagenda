import {
  Banknote,
  Clock,
  CalendarOff,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { STATUS_LABELS } from "@/types";
import type { HrDashboard } from "@/lib/hr-dashboard";
import { cn } from "@/lib/utils";

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const h = (n: number) => `${n.toLocaleString("fr-FR")} h`;
const pct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;

/**
 * Tableau de bord RH — pilotage titulaire. Présentation pure (données calculées
 * côté serveur). KPIs du mois + Δ, tendances 6 mois (heures / coût /
 * absentéisme), et cumul par collaborateur.
 */
export function PilotageView({ data }: { data: HrDashboard }) {
  const { months, employees } = data;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];

  const totalCost = employees.reduce((s, e) => s + e.cost, 0);
  const totalOvertime = employees.reduce((s, e) => s + e.overtimeHours, 0);

  const maxHours = Math.max(1, ...months.map((m) => m.workedHours + m.absenceHours));
  const maxCost = Math.max(1, ...months.map((m) => m.cost));
  const maxRate = Math.max(0.02, ...months.map((m) => m.absenteeismRate));

  return (
    <div className="w-full p-3 md:p-4 lg:p-6 pb-16 max-w-5xl mx-auto">
      {/* En-tête */}
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          <TrendingUp className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Pilotage RH</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Absentéisme, heures sup, coût et tendances — estimations sur 6 mois.
          </p>
        </div>
      </header>

      {/* KPIs du mois courant */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Banknote className="h-4 w-4" />}
          tone="emerald"
          label={`Coût estimé · ${cur.label}`}
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
          icon={<Clock className="h-4 w-4" />}
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
      </div>

      {/* Tendances */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Heures : travaillées (dont HS) + absences */}
        <Panel title="Heures par mois" hint="Travaillées (violet) · heures sup (ambre) · absences subies (rose)">
          <div className="flex items-end justify-between gap-2 pt-2">
            {months.map((m) => {
              const regular = Math.max(0, m.workedHours - m.overtimeHours);
              const H = 132;
              const seg = (v: number) => Math.round((v / maxHours) * H);
              return (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="flex w-full max-w-[38px] flex-col-reverse overflow-hidden rounded-md"
                    style={{ height: H }}
                    title={`${m.label} — ${h(m.workedHours)} travaillées (dont ${h(m.overtimeHours)} sup), ${h(m.absenceHours)} d'absence`}
                  >
                    <div className="bg-violet-500" style={{ height: seg(regular) }} />
                    <div className="bg-amber-400" style={{ height: seg(m.overtimeHours) }} />
                    <div className="bg-rose-400" style={{ height: seg(m.absenceHours) }} />
                  </div>
                  <span className="text-[10.5px] capitalize text-muted-foreground">{m.label}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Coût par mois */}
        <Panel title="Coût employeur par mois" hint="Estimation (brut + charges patronales)">
          <div className="flex items-end justify-between gap-2 pt-2">
            {months.map((m) => {
              const H = 132;
              const barH = Math.max(2, Math.round((m.cost / maxCost) * H));
              return (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-col items-center justify-end" style={{ height: H }}>
                    <span className="mb-0.5 text-[9.5px] font-medium tabular-nums text-muted-foreground">
                      {Math.round(m.cost / 1000)}k
                    </span>
                    <div
                      className="w-full max-w-[38px] rounded-md bg-emerald-500"
                      style={{ height: barH }}
                      title={`${m.label} — ${eur(m.cost)}`}
                    />
                  </div>
                  <span className="text-[10.5px] capitalize text-muted-foreground">{m.label}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Absentéisme (tendance fine) */}
      <Panel
        className="mt-4"
        title="Taux d'absentéisme"
        hint="Maladie + absences injustifiées / heures totales"
      >
        <div className="flex items-end justify-between gap-2 pt-2">
          {months.map((m) => {
            const H = 70;
            const barH = Math.max(2, Math.round((m.absenteeismRate / maxRate) * H));
            const hot = m.absenteeismRate >= 0.08;
            return (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                  {pct(m.absenteeismRate)}
                </span>
                <div className="flex w-full items-end justify-center" style={{ height: H }}>
                  <div
                    className={cn("w-full max-w-[38px] rounded-md", hot ? "bg-rose-500" : "bg-rose-300")}
                    style={{ height: barH }}
                    title={`${m.label} — ${pct(m.absenteeismRate)}`}
                  />
                </div>
                <span className="text-[10.5px] capitalize text-muted-foreground">{m.label}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Cumul par collaborateur */}
      <section className="mt-6 rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-foreground">
            Par collaborateur · 6 mois
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Total : <strong className="text-foreground">{eur(totalCost)}</strong> ·{" "}
            {h(totalOvertime)} sup
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground/70">
                <th className="px-4 py-2 font-medium">Collaborateur</th>
                <th className="px-3 py-2 text-right font-medium">Travaillées</th>
                <th className="px-3 py-2 text-right font-medium">H. sup</th>
                <th className="px-3 py-2 text-right font-medium">Absences</th>
                <th className="px-4 py-2 text-right font-medium">Coût estimé</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-t border-border/50">
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{e.name}</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {STATUS_LABELS[e.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{h(e.workedHours)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      e.overtimeHours > 0 && "font-medium text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {e.overtimeHours > 0 ? h(e.overtimeHours) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      e.absenceHours > 0 && "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {e.absenceHours > 0 ? h(e.absenceHours) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-foreground">
                    {eur(e.cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-[11px] text-muted-foreground/70">
        Chiffres estimatifs, calculés à partir du planning et des réglages de paie
        (mêmes hypothèses que le module Rémunération). À usage de pilotage interne.
      </p>
    </div>
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
  /** Pour coût/HS/absentéisme : une HAUSSE est « mauvaise » (rouge). */
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
          {delta.text} <span className="text-muted-foreground/70">vs mois préc.</span>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        className
      )}
    >
      <div className="mb-1">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
