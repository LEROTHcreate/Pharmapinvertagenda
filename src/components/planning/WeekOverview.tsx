"use client";

import { useMemo } from "react";
import Link from "next/link";
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

/** Section d'une journée (matin OU après-midi).
 *  hours = nombre d'heures TASK travaillées dans la plage
 *  range = "09:00–13:00" (1re et dernière demi-heure travaillée)
 *  tasks = postes occupés sur la plage, triés par fréquence
 */
type DaySection = {
  hours: number;
  range: string | null;
  tasks: TaskCode[];
};

type DaySummary = {
  am: DaySection;
  pm: DaySection;
  hoursTotal: number;
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
        const empty: DaySection = { hours: 0, range: null, tasks: [] };
        if (!day) return { am: empty, pm: empty, hoursTotal: 0, absences: [] };

        // Compteurs séparés matin (avant 12:00) / après-midi (≥ 12:00)
        const amTasks = new Map<TaskCode, number>();
        const pmTasks = new Map<TaskCode, number>();
        let amHours = 0;
        let pmHours = 0;
        const amSlots: string[] = [];
        const pmSlots: string[] = [];
        const absences = new Set<AbsenceCode>();

        day.forEach((e, slot) => {
          if (e.type === "ABSENCE" && e.absenceCode) {
            absences.add(e.absenceCode);
            return;
          }
          if (e.type === "TASK" && e.taskCode) {
            const isMorning = slot < "12:00";
            if (isMorning) {
              amHours += 0.5;
              amSlots.push(slot);
              amTasks.set(e.taskCode, (amTasks.get(e.taskCode) ?? 0) + 1);
            } else {
              pmHours += 0.5;
              pmSlots.push(slot);
              pmTasks.set(e.taskCode, (pmTasks.get(e.taskCode) ?? 0) + 1);
            }
          }
        });

        const sectionFrom = (
          slots: string[],
          tasksMap: Map<TaskCode, number>,
          hours: number
        ): DaySection => {
          if (slots.length === 0) return { hours: 0, range: null, tasks: [] };
          const sorted = [...slots].sort();
          const start = sorted[0];
          // Fin = dernière demi-heure travaillée + 30min (ex 13:00 → 13:30)
          const lastSlot = sorted[sorted.length - 1];
          const [h, m] = lastSlot.split(":").map(Number);
          const endMin = h * 60 + m + 30;
          const endH = String(Math.floor(endMin / 60)).padStart(2, "0");
          const endM = String(endMin % 60).padStart(2, "0");
          const end = `${endH}:${endM}`;
          const tasks = Array.from(tasksMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([t]) => t);
          return { hours, range: `${start}–${end}`, tasks };
        };

        return {
          am: sectionFrom(amSlots, amTasks, amHours),
          pm: sectionFrom(pmSlots, pmTasks, pmHours),
          hoursTotal: dailyTaskHours(emp.id, iso, index),
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
          className="grid items-center gap-1 text-[11px] font-medium text-muted-foreground"
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
                    "mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-foreground/90",
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
              className="hover-lift animate-fade-up rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
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
                    <p className="truncate text-[14px] font-medium tracking-tight text-foreground">
                      {emp.firstName}
                      {emp.lastName !== "—" && ` ${emp.lastName}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {STATUS_LABELS[emp.status]} · {emp.weeklyHours}h
                    </p>
                  </div>
                </div>

                {/* 6 cellules jours — chaque jour est un lien vers la vue
                    journalière correspondante (?week=...&day=N) */}
                {perDay.map((d, i) => (
                  <DayCell
                    key={i}
                    summary={d}
                    isToday={i === todayIdx}
                    weekStart={weekStart}
                    dayIndex={i}
                  />
                ))}

                {/* Total semaine */}
                <div
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl px-2 py-2",
                    overtimeKind === "over" && "bg-orange-50/70",
                    overtimeKind === "under" && "bg-muted/40",
                    overtimeKind === "ok" && "bg-emerald-50/60"
                  )}
                >
                  <div className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
                    {total.toFixed(1)}h
                  </div>
                  <div
                    className={cn(
                      "text-[10px] font-medium tabular-nums",
                      overtimeKind === "over" && "text-orange-600",
                      overtimeKind === "under" && "text-muted-foreground/70",
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
      <div className="rounded-2xl border border-border/60 bg-muted/40 px-2.5 py-2">
        <div
          className="grid items-center gap-1.5"
          style={{ gridTemplateColumns: COL_TEMPLATE }}
        >
          <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground/90">
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
            <span className="font-mono text-[14px] font-semibold tabular-nums text-foreground">
              {teamTotal.toFixed(0)}h
            </span>
            <span className="text-[10px] text-muted-foreground">équipe</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Cellule jour ─────────────────────────────────────────────── */

/**
 * Cellule d'un jour de la semaine pour un collaborateur.
 * - Affichage : matin (range + h + postes) puis après-midi (idem).
 * - Cliquable : navigue vers `/planning?week=YYYY-MM-DD&day=N` (vue jour).
 */
function DayCell({
  summary,
  isToday,
  weekStart,
  dayIndex,
}: {
  summary: DaySummary;
  isToday?: boolean;
  weekStart: string;
  dayIndex: number;
}) {
  const { am, pm, hoursTotal, absences } = summary;
  const href = `/planning?week=${weekStart}&day=${dayIndex}`;

  const baseClass = cn(
    "flex h-full min-h-[60px] flex-col gap-1 rounded-xl px-2 py-1.5 transition-colors",
    "hover:bg-violet-50/40 hover:ring-1 hover:ring-violet-200/60 cursor-pointer",
    isToday && "ring-1 ring-inset ring-violet-200/70"
  );

  // Cas 1 : absence sur la journée → on prime, on affiche le motif
  if (absences.length > 0) {
    return (
      <Link href={href} className={cn(baseClass, "items-center justify-center bg-muted/40")}>
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
        {hoursTotal > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
            {hoursTotal.toFixed(1)}h
          </span>
        )}
      </Link>
    );
  }

  // Cas 2 : journée totalement vide
  if (am.hours === 0 && pm.hours === 0) {
    return (
      <Link
        href={href}
        className={cn(baseClass, "items-center justify-center text-muted-foreground/40")}
      >
        <span className="text-[12px]">—</span>
      </Link>
    );
  }

  // Cas 3 : journée travaillée — split matin + après-midi
  return (
    <Link href={href} className={cn(baseClass, "bg-muted/40")}>
      <Section label="Matin" section={am} />
      <div className="border-t border-border/60" aria-hidden />
      <Section label="A-midi" section={pm} />
    </Link>
  );
}

/** Une moitié de journée (matin OU après-midi) au sein du DayCell. */
function Section({ label, section }: { label: string; section: DaySection }) {
  if (section.hours === 0) {
    return (
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/40">
        <span className="uppercase tracking-wide">{label}</span>
        <span>—</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {section.range}
        </span>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
          {section.hours.toFixed(1)}h
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {section.tasks.slice(0, 2).map((code) => {
          const c = TASK_COLORS[code];
          return (
            <span
              key={code}
              title={TASK_LABELS[code]}
              className="rounded px-1.5 py-0.5 text-[9.5px] font-medium ring-1 ring-inset leading-none"
              style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
            >
              {TASK_LABELS[code]}
            </span>
          );
        })}
        {section.tasks.length > 2 && (
          <span className="text-[9.5px] text-muted-foreground/70">+{section.tasks.length - 2}</span>
        )}
      </div>
    </div>
  );
}

function todayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
