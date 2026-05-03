"use client";

import { useMemo, useState } from "react";
import type { AbsenceCode } from "@prisma/client";
import {
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  STATUS_LABELS,
  type EmployeeDTO,
  type ScheduleEntryDTO,
} from "@/types";
import {
  dailyTaskHours,
  indexEntriesByEmployee,
} from "@/lib/planning-utils";
import { cn } from "@/lib/utils";
import { RolesLegend } from "@/components/planning/RolesLegend";

const WEEKDAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"] as const;

type DayState =
  | { kind: "off" }
  | { kind: "absence"; code: AbsenceCode }
  | { kind: "worked"; hours: number };

/**
 * Vue mois — heatmap polie : cellules arrondies, hover crosshair (ligne+colonne),
 * tooltip riche, animation d'entrée échelonnée.
 */
export function MonthOverview({
  monthStart,
  employees,
  entries,
}: {
  monthStart: string;
  employees: EmployeeDTO[];
  entries: ScheduleEntryDTO[];
}) {
  const month = useMemo(() => new Date(`${monthStart}T00:00:00`), [monthStart]);
  const monthLabel = useMemo(
    () =>
      month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    [month]
  );

  const days = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const result: { iso: string; day: number; weekday: number }[] = [];
    for (let d = 1; d <= last; d++) {
      const date = new Date(y, m, d);
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const weekday = (date.getDay() + 6) % 7;
      result.push({ iso, day: d, weekday });
    }
    return result;
  }, [month]);

  const today = todayIso();
  const index = useMemo(() => indexEntriesByEmployee(entries), [entries]);

  // Hover crosshair — coordonnées { row, col }
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);

  const employeeRows = useMemo(() => {
    return employees.map((emp) => {
      const cells: DayState[] = days.map(({ iso, weekday }) => {
        if (weekday === 6) return { kind: "off" };
        const day = index.get(emp.id)?.get(iso);
        if (!day || day.size === 0) return { kind: "off" };

        const abs = Array.from(day.values()).find((e) => e.type === "ABSENCE");
        if (abs?.absenceCode) return { kind: "absence", code: abs.absenceCode };

        const hours = dailyTaskHours(emp.id, iso, index);
        if (hours === 0) return { kind: "off" };
        return { kind: "worked", hours };
      });

      let workedHours = 0;
      let workedDays = 0;
      const absencesCount = new Map<AbsenceCode, number>();
      cells.forEach((c) => {
        if (c.kind === "worked") {
          workedHours += c.hours;
          workedDays++;
        } else if (c.kind === "absence") {
          absencesCount.set(c.code, (absencesCount.get(c.code) ?? 0) + 1);
        }
      });
      return { emp, cells, workedHours, workedDays, absencesCount };
    });
  }, [employees, days, index]);

  const dayTotals = useMemo(() => {
    return days.map(({ iso, weekday }) => {
      if (weekday === 6) return { teamHours: 0, absent: 0 };
      let teamHours = 0;
      let absent = 0;
      employees.forEach((emp) => {
        teamHours += dailyTaskHours(emp.id, iso, index);
        const day = index.get(emp.id)?.get(iso);
        if (day && Array.from(day.values()).some((e) => e.type === "ABSENCE")) {
          absent++;
        }
      });
      return { teamHours, absent };
    });
  }, [employees, days, index]);

  // Largeur de cellule + colonne collaborateur : on essaie de garder du confort visuel
  const gridTemplate = `220px repeat(${days.length}, 32px) 96px`;

  return (
    <div className="space-y-4">
      <RolesLegend employees={employees} />

      <div className="overflow-x-auto rounded-2xl border border-zinc-200/60 bg-white p-1 shadow-sm">
        <div className="min-w-fit rounded-xl">
          {/* En-tête : jours du mois */}
          <div
            className="grid items-center bg-gradient-to-b from-zinc-50/80 to-white/40 backdrop-blur"
            style={{ gridTemplateColumns: gridTemplate }}
            onMouseLeave={() => setHover(null)}
          >
            <div className="px-4 py-3 text-[12px] font-semibold capitalize tracking-tight text-zinc-700">
              {monthLabel}
            </div>
            {days.map((d, colIdx) => {
              const isToday = d.iso === today;
              const isWeekend = d.weekday >= 5;
              const isHoverCol = hover?.col === colIdx;
              return (
                <div
                  key={d.iso}
                  className={cn(
                    "py-2 text-center transition-colors",
                    isWeekend && "bg-zinc-50/60",
                    isHoverCol && "bg-violet-50/70"
                  )}
                  onMouseEnter={() => setHover({ row: -1, col: colIdx })}
                >
                  <div
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wider transition-colors",
                      isToday
                        ? "text-violet-600"
                        : isHoverCol
                          ? "text-violet-500"
                          : "text-zinc-400"
                    )}
                  >
                    {WEEKDAY_LETTERS[d.weekday]}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 flex h-5 w-full items-center justify-center font-mono text-[11px] tabular-nums transition-colors",
                      isToday
                        ? "font-bold text-violet-600"
                        : isHoverCol
                          ? "font-semibold text-zinc-900"
                          : "text-zinc-700"
                    )}
                  >
                    {d.day}
                  </div>
                </div>
              );
            })}
            <div className="px-3 py-3 text-center text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Mois
            </div>
          </div>

          {/* Lignes collaborateurs */}
          {employeeRows.map(
            ({ emp, cells, workedHours, workedDays, absencesCount }, rowIdx) => {
              const isHoverRow = hover?.row === rowIdx;
              return (
                <div
                  key={emp.id}
                  className="animate-fade-up grid items-center border-t border-zinc-100/80"
                  style={{
                    gridTemplateColumns: gridTemplate,
                    animationDelay: `${Math.min(rowIdx * 24, 240)}ms`,
                    opacity: 0,
                  }}
                  onMouseLeave={(e) => {
                    if (
                      !(e.relatedTarget instanceof Node) ||
                      !e.currentTarget.contains(e.relatedTarget)
                    ) {
                      // hover géré au niveau cell
                    }
                  }}
                >
                  {/* Identité */}
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 transition-colors",
                      isHoverRow && "bg-violet-50/40"
                    )}
                  >
                    <div
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 ring-white"
                      style={{
                        background: `linear-gradient(135deg, ${emp.displayColor}, ${emp.displayColor}cc)`,
                      }}
                      aria-hidden
                    >
                      <span className="text-[11px] font-semibold text-white">
                        {(emp.firstName[0] ?? "?").toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium tracking-tight text-zinc-900">
                        {emp.firstName}
                        {emp.lastName !== "—" && ` ${emp.lastName}`}
                      </p>
                      <p className="truncate text-[10px] text-zinc-500">
                        {STATUS_LABELS[emp.status]}
                      </p>
                    </div>
                  </div>

                  {/* Cellules jours */}
                  {cells.map((cell, colIdx) => (
                    <DayHeatCell
                      key={days[colIdx].iso}
                      state={cell}
                      weekday={days[colIdx].weekday}
                      iso={days[colIdx].iso}
                      empName={`${emp.firstName}${emp.lastName !== "—" ? " " + emp.lastName : ""}`}
                      empColor={emp.displayColor}
                      isHoverCross={hover?.col === colIdx || hover?.row === rowIdx}
                      isHoverExact={hover?.col === colIdx && hover?.row === rowIdx}
                      isToday={days[colIdx].iso === today}
                      onEnter={() => setHover({ row: rowIdx, col: colIdx })}
                    />
                  ))}

                  {/* Total mois */}
                  <div
                    className={cn(
                      "flex flex-col items-end px-4 py-2 transition-colors",
                      isHoverRow && "bg-violet-50/40"
                    )}
                  >
                    <span className="font-mono text-[14px] font-semibold tabular-nums text-zinc-900">
                      {workedHours.toFixed(0)}h
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {workedDays}j
                      {absencesCount.size > 0 && (
                        <span className="ml-1 text-amber-600">
                          ·{" "}
                          {Array.from(absencesCount.values()).reduce(
                            (s, n) => s + n,
                            0
                          )}{" "}
                          abs.
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            }
          )}

          {/* Récap équipe */}
          <div
            className="grid items-center border-t-2 border-zinc-200/70 bg-zinc-50/50"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Récap équipe
            </div>
            {dayTotals.map((t, i) => {
              const isHoverCol = hover?.col === i;
              return (
                <div
                  key={days[i].iso}
                  className={cn(
                    "py-2 text-center transition-colors",
                    isHoverCol && "bg-violet-50/40"
                  )}
                  title={`${days[i].iso} · ${t.teamHours.toFixed(0)}h${
                    t.absent ? ` · ${t.absent} abs.` : ""
                  }`}
                >
                  <div
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      t.teamHours > 0 ? "text-zinc-700" : "text-zinc-300"
                    )}
                  >
                    {t.teamHours > 0 ? Math.round(t.teamHours) : ""}
                  </div>
                </div>
              );
            })}
            <div className="px-4 py-2 text-right">
              <span className="font-mono text-[13px] font-semibold tabular-nums text-zinc-900">
                {dayTotals.reduce((s, t) => s + t.teamHours, 0).toFixed(0)}h
              </span>
            </div>
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

/* ─── Cellule heatmap ─────────────────────────────────────────────── */

/**
 * Convertit "#rrggbb" en "rgba(r, g, b, alpha)".
 * Sert à appliquer la couleur du rôle du collaborateur sur les cellules
 * "travaillé" tout en modulant l'opacité selon le nombre d'heures faites.
 */
function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace(/^#/, "");
  if (cleaned.length !== 6) {
    // Fallback violet (couleur historique avant le passage au color-by-role)
    return `rgba(124, 58, 237, ${alpha})`;
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function DayHeatCell({
  state,
  weekday,
  iso,
  empName,
  empColor,
  isHoverCross,
  isHoverExact,
  isToday,
  onEnter,
}: {
  state: DayState;
  weekday: number;
  iso: string;
  empName: string;
  /** Couleur (hex #rrggbb) liée au rôle du collaborateur */
  empColor: string;
  isHoverCross: boolean;
  isHoverExact: boolean;
  isToday: boolean;
  onEnter: () => void;
}) {
  const isWeekend = weekday >= 5;

  let bg = "transparent";
  let inner: React.ReactNode = null;
  let title = "";

  if (state.kind === "off") {
    bg = isWeekend ? "rgb(244 244 245 / 0.5)" : "rgb(250 250 251 / 0.6)";
    title = `${empName} — ${formatHumanDate(iso)} : repos`;
  } else if (state.kind === "absence") {
    const s = ABSENCE_STYLES[state.code];
    bg = s.bg;
    // Hachures diagonales identiques à la vue journalière (PlanningGrid) →
    // signal visuel constant "absence" peu importe la vue. Mêmes paramètres
    // de pattern (45°, 1.5px de hachure tous les 6px) pour cohérence.
    inner = (
      <div
        className="h-full w-full rounded-md ring-1 ring-inset"
        style={{
          borderColor: s.border,
          backgroundColor: s.bg,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0 1.5px, transparent 1.5px 6px)",
        }}
      />
    );
    title = `${empName} — ${formatHumanDate(iso)} : ${ABSENCE_LABELS[state.code]}`;
  } else {
    // Couleur de la case = couleur du rôle du collaborateur, opacité modulée
    // par l'intensité (heures faites). Plus le collab a de TASK ce jour-là,
    // plus la case est saturée.
    const intensity = clamp(state.hours / 7.5, 0.3, 1);
    bg = hexToRgba(empColor, intensity * 0.7);
    inner = (
      <div
        className="h-full w-full rounded-md"
        style={{ backgroundColor: bg }}
      />
    );
    title = `${empName} — ${formatHumanDate(iso)} : ${state.hours.toFixed(1)}h`;
  }

  return (
    <div
      className={cn(
        "h-10 px-0.5 py-1 transition-all duration-150",
        isHoverCross && "bg-violet-50/40",
        isToday && "bg-violet-50/30"
      )}
      onMouseEnter={onEnter}
      title={title}
    >
      <div
        className={cn(
          "h-full w-full rounded-md transition-all duration-150",
          state.kind === "off"
            ? "bg-transparent"
            : "ring-1 ring-inset ring-black/5",
          isHoverExact &&
            "scale-110 shadow-[0_4px_12px_-4px_rgba(124,58,237,0.4)] ring-2 ring-violet-400"
        )}
        style={{
          backgroundColor: state.kind === "off" ? bg : undefined,
        }}
      >
        {inner}
      </div>
    </div>
  );
}

/* ─── Légende ─────────────────────────────────────────────────────── */

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-zinc-200/50 bg-white/60 px-4 py-2.5 text-[12px] text-zinc-600">
      <span className="font-medium text-zinc-500">Légende :</span>

      <span className="inline-flex items-center gap-2">
        <span className="flex h-3 overflow-hidden rounded-md ring-1 ring-zinc-200">
          {[0.3, 0.5, 0.75, 1].map((a) => (
            <span
              key={a}
              className="h-3 w-3.5"
              // Gradient gris neutre — la VRAIE couleur est celle du rôle
              // (cf. RolesLegend juste au-dessus). Ici on montre uniquement
              // que l'intensité reflète le nombre d'heures travaillées.
              style={{ backgroundColor: `rgba(82, 82, 91, ${a * 0.7})` }}
            />
          ))}
        </span>
        Couleur = rôle · intensité = heures
      </span>

      {(["CONGE", "MALADIE", "FORMATION_ABS", "ABSENT"] as AbsenceCode[]).map(
        (code) => {
          const s = ABSENCE_STYLES[code];
          return (
            <span key={code} className="inline-flex items-center gap-1.5">
              <span
                className="h-3 w-3.5 rounded-md ring-1 ring-inset"
                style={{
                  backgroundColor: s.bg,
                  borderColor: s.border,
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0 1.5px, transparent 1.5px 6px)",
                }}
              />
              {ABSENCE_LABELS[code]}
            </span>
          );
        }
      )}

      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3.5 rounded-md bg-zinc-100/80 ring-1 ring-inset ring-zinc-200" />
        Repos / Dimanche
      </span>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function todayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function formatHumanDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}
