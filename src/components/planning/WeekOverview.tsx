"use client";

import { useMemo } from "react";
import type { AbsenceCode, TaskCode } from "@prisma/client";
import {
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_LABELS,
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
  type EmployeeDTO,
  type ScheduleEntryDTO,
} from "@/types";
import {
  dailyTaskHours,
  indexEntriesByEmployee,
  staffingForSlot,
  toIsoDate,
  weekDays,
  weeklyTaskHours,
} from "@/lib/planning-utils";
import { TIME_SLOTS } from "@/types";
import { cn } from "@/lib/utils";
import { RolesLegend } from "@/components/planning/RolesLegend";

type DaySummary = {
  hours: number;
  tasks: TaskCode[];
  absences: AbsenceCode[];
};

const COL_TEMPLATE = "minmax(220px, 1.4fr) repeat(6, minmax(110px, 1fr)) 110px";

/**
 * Vue semaine — synthèse aérée façon "row-cards" Apple.
 * Lecture seule : pour modifier, repasser sur la vue jour.
 */
export function WeekOverview({
  weekStart,
  employees,
  entries,
  minStaff,
}: {
  weekStart: string;
  employees: EmployeeDTO[];
  entries: ScheduleEntryDTO[];
  minStaff: number;
}) {
  const monday = useMemo(() => new Date(`${weekStart}T00:00:00`), [weekStart]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const dayDates = useMemo(() => days.map(toIsoDate), [days]);
  const today = todayIso();
  const todayIdx = dayDates.indexOf(today);
  const index = useMemo(() => indexEntriesByEmployee(entries), [entries]);

  const employeeRows = useMemo(() => {
    return employees.map((emp) => {
      const perDay: DaySummary[] = dayDates.map((iso) => {
        const day = index.get(emp.id)?.get(iso);
        if (!day) return { hours: 0, tasks: [], absences: [] };

        const taskCounts = new Map<TaskCode, number>();
        const absences = new Set<AbsenceCode>();
        day.forEach((e) => {
          if (e.type === "TASK" && e.taskCode) {
            taskCounts.set(e.taskCode, (taskCounts.get(e.taskCode) ?? 0) + 1);
          } else if (e.type === "ABSENCE" && e.absenceCode) {
            absences.add(e.absenceCode);
          }
        });
        const tasks = Array.from(taskCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([t]) => t);
        return {
          hours: dailyTaskHours(emp.id, iso, index),
          tasks,
          absences: Array.from(absences),
        };
      });
      const total = weeklyTaskHours(emp.id, dayDates, index);
      return { emp, perDay, total };
    });
  }, [employees, dayDates, index]);

  const dayTotals = useMemo(() => {
    const ids = employees.map((e) => e.id);
    return dayDates.map((iso) => {
      let hours = 0;
      let absent = 0;
      employees.forEach((emp) => {
        hours += dailyTaskHours(emp.id, iso, index);
        const day = index.get(emp.id)?.get(iso);
        if (day && Array.from(day.values()).some((e) => e.type === "ABSENCE")) {
          absent++;
        }
      });
      let minCoverage = Infinity;
      for (const slot of TIME_SLOTS) {
        // Horaires d'ouverture : 08:30 → 20:00
        if (slot < "08:30" || slot >= "20:00") continue;
        const c = staffingForSlot(iso, slot, ids, index);
        if (c < minCoverage) minCoverage = c;
      }
      if (!isFinite(minCoverage)) minCoverage = 0;
      return { hours, absent, minCoverage };
    });
  }, [employees, dayDates, index]);

  const teamTotal = employeeRows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-3">
      <RolesLegend employees={employees} />

      {/* En-tête sticky : jours de la semaine */}
      <div className="sticky top-0 z-10 -mx-4 bg-gradient-to-b from-white via-white/95 to-transparent px-4 pb-2 pt-1 backdrop-blur md:-mx-6 md:px-6">
        <div
          className="grid items-center gap-1 text-[11px] font-medium text-zinc-500"
          style={{ gridTemplateColumns: COL_TEMPLATE }}
        >
          <div className="px-2 uppercase tracking-wide">Collaborateur</div>
          {days.map((d, i) => {
            const isToday = i === todayIdx;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-2 py-2 text-center",
                  isToday && "bg-violet-50/70 ring-1 ring-inset ring-violet-200"
                )}
              >
                <div
                  className={cn(
                    "text-[10px] uppercase tracking-wider opacity-70",
                    isToday && "text-violet-600 opacity-100"
                  )}
                >
                  <span className="hidden md:inline">{WEEK_DAYS[i]}</span>
                  <span className="md:hidden">{WEEK_DAYS_SHORT[i]}</span>
                </div>
                <div
                  className={cn(
                    "mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-zinc-800",
                    isToday && "text-violet-600"
                  )}
                >
                  {d.getDate().toString().padStart(2, "0")}/
                  {(d.getMonth() + 1).toString().padStart(2, "0")}
                </div>
              </div>
            );
          })}
          <div className="px-2 text-right uppercase tracking-wide">Total</div>
        </div>
      </div>

      {/* Lignes collaborateurs (cards) */}
      <div className="space-y-2">
        {employeeRows.map(({ emp, perDay, total }, rowIdx) => {
          const overtime = total - emp.weeklyHours;
          const overtimeKind: "over" | "under" | "ok" =
            overtime > 0.1 ? "over" : overtime < -0.1 ? "under" : "ok";

          return (
            <div
              key={emp.id}
              className="hover-lift animate-fade-up rounded-2xl border border-zinc-200/60 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              style={{
                animationDelay: `${Math.min(rowIdx * 30, 240)}ms`,
                opacity: 0,
              }}
            >
              <div
                className="grid items-stretch gap-1 p-2 sm:gap-1.5 sm:p-2.5"
                style={{ gridTemplateColumns: COL_TEMPLATE }}
              >
                {/* Identité */}
                <div className="flex items-center gap-3 px-2 py-1">
                  <div
                    className="relative h-9 w-9 shrink-0 rounded-full ring-2 ring-white"
                    style={{
                      background: `linear-gradient(135deg, ${emp.displayColor}, ${emp.displayColor}cc)`,
                    }}
                    aria-hidden
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold text-white">
                      {(emp.firstName[0] ?? "?").toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium tracking-tight text-zinc-900">
                      {emp.firstName}
                      {emp.lastName !== "—" && ` ${emp.lastName}`}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {STATUS_LABELS[emp.status]} · {emp.weeklyHours}h
                    </p>
                  </div>
                </div>

                {/* 6 cellules jours */}
                {perDay.map((d, i) => (
                  <DayCell key={i} summary={d} isToday={i === todayIdx} />
                ))}

                {/* Total semaine */}
                <div
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl px-2 py-2",
                    overtimeKind === "over" && "bg-orange-50/70",
                    overtimeKind === "under" && "bg-zinc-50/70",
                    overtimeKind === "ok" && "bg-emerald-50/60"
                  )}
                >
                  <div className="font-mono text-[15px] font-semibold tabular-nums text-zinc-900">
                    {total.toFixed(1)}h
                  </div>
                  <div
                    className={cn(
                      "text-[10px] font-medium tabular-nums",
                      overtimeKind === "over" && "text-orange-600",
                      overtimeKind === "under" && "text-zinc-400",
                      overtimeKind === "ok" && "text-emerald-700"
                    )}
                  >
                    {overtimeKind === "over" && `+${overtime.toFixed(1)}h`}
                    {overtimeKind === "under" && `−${Math.abs(overtime).toFixed(1)}h`}
                    {overtimeKind === "ok" && "au contrat"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Récap équipe par jour */}
      <div className="rounded-2xl border border-zinc-200/60 bg-zinc-50/50 px-2.5 py-2">
        <div
          className="grid items-center gap-1.5"
          style={{ gridTemplateColumns: COL_TEMPLATE }}
        >
          <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Récap équipe
          </div>
          {dayTotals.map((t, i) => {
            const critical = t.minCoverage > 0 && t.minCoverage < minStaff;
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg py-1.5",
                  i === todayIdx && "bg-violet-50/40"
                )}
              >
                <span className="font-mono text-[13px] font-semibold tabular-nums text-zinc-800">
                  {t.hours.toFixed(0)}h
                </span>
                <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                  {t.absent > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                      {t.absent} abs.
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 font-medium tabular-nums",
                      critical
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700"
                    )}
                    title={`Effectif min sur la journée : ${t.minCoverage}`}
                  >
                    min {t.minCoverage}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="flex flex-col items-end px-2">
            <span className="font-mono text-[14px] font-semibold tabular-nums text-zinc-900">
              {teamTotal.toFixed(0)}h
            </span>
            <span className="text-[10px] text-zinc-500">équipe</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Cellule jour ─────────────────────────────────────────────── */

function DayCell({
  summary,
  isToday,
}: {
  summary: DaySummary;
  isToday?: boolean;
}) {
  const { hours, tasks, absences } = summary;

  const baseClass = cn(
    "flex h-full min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 transition-colors",
    isToday && "ring-1 ring-inset ring-violet-200/70"
  );

  if (absences.length > 0) {
    return (
      <div className={cn(baseClass, "bg-zinc-50/40")}>
        {absences.map((code) => {
          const s = ABSENCE_STYLES[code];
          return (
            <span
              key={code}
              className="rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset"
              style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
            >
              {ABSENCE_LABELS[code]}
            </span>
          );
        })}
        {hours > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-zinc-400">
            {hours.toFixed(1)}h
          </span>
        )}
      </div>
    );
  }

  if (tasks.length === 0 && hours === 0) {
    return (
      <div className={cn(baseClass, "text-zinc-300")}>
        <span className="text-[12px]">—</span>
      </div>
    );
  }

  return (
    <div className={cn(baseClass, "bg-zinc-50/40 hover:bg-zinc-50/80")}>
      <span className="font-mono text-[14px] font-semibold tabular-nums text-zinc-900">
        {hours.toFixed(1)}h
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {tasks.slice(0, 3).map((code) => {
          const c = TASK_COLORS[code];
          return (
            <span
              key={code}
              title={TASK_LABELS[code]}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset"
              style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
            >
              {TASK_LABELS[code]}
            </span>
          );
        })}
        {tasks.length > 3 && (
          <span className="text-[10px] text-zinc-400">+{tasks.length - 3}</span>
        )}
      </div>
    </div>
  );
}

function todayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
