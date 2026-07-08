"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { AbsenceCode, EmployeeStatus } from "@prisma/client";
import {
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  STATUS_LABELS,
  isNonWorkedTask,
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

/** Frontière matin / après-midi (cohérent avec la vue semaine). */
const MIDDAY = "12:00";

type DayState =
  | { kind: "off" }
  | { kind: "absence"; code: AbsenceCode }
  | { kind: "worked"; hours: number };

/** Une journée = deux demi-journées (matin + après-midi). */
type DayCells = { am: DayState; pm: DayState };

/**
 * Vue mois — heatmap polie : chaque jour est coupé en deux (matin / après-midi),
 * cellules arrondies, hover crosshair (ligne+colonne), tooltip riche.
 * Pleine largeur (colonnes élastiques) + filtre par métier via la légende des
 * rôles cliquable.
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
  const router = useRouter();

  // Filtre par métier (statut) — Set vide = tous visibles. Piloté par la
  // légende des rôles cliquable (plus de dropdown séparé).
  const [statusFilter, setStatusFilter] = useState<Set<EmployeeStatus>>(new Set());
  const visibleEmployees = useMemo(
    () =>
      statusFilter.size === 0
        ? employees
        : employees.filter((e) => statusFilter.has(e.status)),
    [employees, statusFilter]
  );
  const toggleStatus = useCallback((s: EmployeeStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  /**
   * Double-click sur une cellule jour → ouvre la vue journalière de ce jour
   * dans /planning (?week=<lundi>&day=<index>). Le serveur gère la redirection
   * propre de PlanningView qui se positionne automatiquement sur la bonne
   * semaine + le bon jour. Le simple click reste réservé au hover crosshair —
   * ouvrir au moindre tap serait trop intrusif sur tablette.
   */
  const openDay = useCallback(
    (iso: string) => {
      const target = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(target.getTime())) return;
      const dow = target.getDay(); // 0=dim..6=sam
      const diffToMonday = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(target);
      monday.setDate(target.getDate() + diffToMonday);
      const yyyy = monday.getFullYear();
      const mm = String(monday.getMonth() + 1).padStart(2, "0");
      const dd = String(monday.getDate()).padStart(2, "0");
      const mondayIso = `${yyyy}-${mm}-${dd}`;
      // Index lundi=0..samedi=5, dimanche → samedi
      const dayInWeek = Math.min(5, Math.max(0, (dow + 6) % 7));
      router.push(`/planning?week=${mondayIso}&day=${dayInWeek}`);
    },
    [router]
  );

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
    const off: DayState = { kind: "off" };
    return visibleEmployees.map((emp) => {
      const cells: DayCells[] = days.map(({ iso, weekday }) => {
        if (weekday === 6) return { am: off, pm: off };
        const day = index.get(emp.id)?.get(iso);
        if (!day || day.size === 0) return { am: off, pm: off };

        // Ventile les créneaux du jour entre matin (< 12:00) et après-midi.
        let amHours = 0;
        let pmHours = 0;
        let amAbs: AbsenceCode | null = null;
        let pmAbs: AbsenceCode | null = null;
        day.forEach((e, slot) => {
          const isAm = slot < MIDDAY;
          if (e.type === "ABSENCE" && e.absenceCode) {
            if (isAm) amAbs = amAbs ?? e.absenceCode;
            else pmAbs = pmAbs ?? e.absenceCode;
          } else if (e.type === "TASK" && !isNonWorkedTask(e.taskCode)) {
            // ECHANGE (texturé) = la personne n'est pas là → hors décompte.
            if (isAm) amHours += 0.5;
            else pmHours += 0.5;
          }
        });

        const half = (abs: AbsenceCode | null, hours: number): DayState =>
          abs
            ? { kind: "absence", code: abs }
            : hours > 0
              ? { kind: "worked", hours }
              : { kind: "off" };

        return { am: half(amAbs, amHours), pm: half(pmAbs, pmHours) };
      });

      let workedHours = 0;
      let workedDays = 0;
      const absencesCount = new Map<AbsenceCode, number>();
      cells.forEach(({ am, pm }) => {
        let dayWorked = 0;
        if (am.kind === "worked") dayWorked += am.hours;
        if (pm.kind === "worked") dayWorked += pm.hours;
        workedHours += dayWorked;
        if (dayWorked > 0) workedDays++;
        // Une absence sur le jour (matin OU après-midi) = 1 jour d'absence.
        const absCode =
          am.kind === "absence"
            ? am.code
            : pm.kind === "absence"
              ? pm.code
              : null;
        if (absCode) {
          absencesCount.set(absCode, (absencesCount.get(absCode) ?? 0) + 1);
        }
      });
      return { emp, cells, workedHours, workedDays, absencesCount };
    });
  }, [visibleEmployees, days, index]);

  const dayTotals = useMemo(() => {
    return days.map(({ iso, weekday }) => {
      if (weekday === 6) return { teamHours: 0, absent: 0 };
      let teamHours = 0;
      let absent = 0;
      visibleEmployees.forEach((emp) => {
        teamHours += dailyTaskHours(emp.id, iso, index);
        const day = index.get(emp.id)?.get(iso);
        if (day && Array.from(day.values()).some((e) => e.type === "ABSENCE")) {
          absent++;
        }
      });
      return { teamHours, absent };
    });
  }, [visibleEmployees, days, index]);

  // Colonnes élastiques (1fr) : la grille remplit toute la largeur de l'écran ;
  // sur petit écran elle garde une largeur mini par jour et scrolle.
  const gridTemplate = `minmax(180px, 240px) repeat(${days.length}, minmax(22px, 1fr)) minmax(80px, 104px)`;

  return (
    <div className="space-y-4">
      {/* Légende des rôles CLIQUABLE = filtre par métier (plus de dropdown). */}
      <RolesLegend
        employees={employees}
        selected={statusFilter}
        onToggle={toggleStatus}
        onReset={() => setStatusFilter(new Set())}
      />

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card p-1 shadow-sm">
        <div className="w-full rounded-xl">
          {/* En-tête : jours du mois */}
          <div
            className="grid items-center bg-gradient-to-b from-zinc-50/80 to-white/40 backdrop-blur"
            style={{ gridTemplateColumns: gridTemplate }}
            onMouseLeave={() => setHover(null)}
          >
            <div className="px-4 py-3 text-[12px] font-semibold capitalize tracking-tight text-foreground/85">
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
                    isWeekend && "bg-muted/40",
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
                          : "text-muted-foreground/70"
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
                          ? "font-semibold text-foreground"
                          : "text-foreground/85"
                    )}
                  >
                    {d.day}
                  </div>
                </div>
              );
            })}
            <div className="px-3 py-3 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
                  className="animate-fade-up grid items-center border-t border-border/60"
                  style={{
                    gridTemplateColumns: gridTemplate,
                    animationDelay: `${Math.min(rowIdx * 24, 240)}ms`,
                    opacity: 0,
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
                      <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
                        {emp.firstName}
                        {emp.lastName !== "—" && ` ${emp.lastName}`}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {STATUS_LABELS[emp.status]}
                      </p>
                    </div>
                  </div>

                  {/* Cellules jours (matin + après-midi) */}
                  {cells.map((cell, colIdx) => (
                    <DayHeatCell
                      key={days[colIdx].iso}
                      am={cell.am}
                      pm={cell.pm}
                      weekday={days[colIdx].weekday}
                      iso={days[colIdx].iso}
                      empName={`${emp.firstName}${emp.lastName !== "—" ? " " + emp.lastName : ""}`}
                      empColor={emp.displayColor}
                      isHoverCross={hover?.col === colIdx || hover?.row === rowIdx}
                      isHoverExact={hover?.col === colIdx && hover?.row === rowIdx}
                      isToday={days[colIdx].iso === today}
                      onEnter={() => setHover({ row: rowIdx, col: colIdx })}
                      onOpenDay={openDay}
                    />
                  ))}

                  {/* Total mois */}
                  <div
                    className={cn(
                      "flex flex-col items-end px-4 py-2 transition-colors",
                      isHoverRow && "bg-violet-50/40"
                    )}
                  >
                    <span className="font-mono text-[14px] font-semibold tabular-nums text-foreground">
                      {workedHours.toFixed(0)}h
                    </span>
                    <span className="text-[10px] text-muted-foreground">
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
            className="grid items-center border-t-2 border-border/70 bg-muted/40"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                      t.teamHours > 0 ? "text-foreground/85" : "text-muted-foreground/40"
                    )}
                  >
                    {t.teamHours > 0 ? Math.round(t.teamHours) : ""}
                  </div>
                </div>
              );
            })}
            <div className="px-4 py-2 text-right">
              <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
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

/* ─── Cellule heatmap (matin + après-midi) ────────────────────────── */

/**
 * Convertit "#rrggbb" en "rgba(r, g, b, alpha)".
 * Sert à appliquer la couleur du rôle du collaborateur sur les demi-journées
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
  am,
  pm,
  weekday,
  iso,
  empName,
  empColor,
  isHoverCross,
  isHoverExact,
  isToday,
  onEnter,
  onOpenDay,
}: {
  am: DayState;
  pm: DayState;
  weekday: number;
  iso: string;
  empName: string;
  /** Couleur (hex #rrggbb) liée au rôle du collaborateur */
  empColor: string;
  isHoverCross: boolean;
  isHoverExact: boolean;
  isToday: boolean;
  onEnter: () => void;
  /** Double-click → ouvre la vue jour de cette date dans /planning. */
  onOpenDay: (iso: string) => void;
}) {
  const isWeekend = weekday >= 5;
  const bothOff = am.kind === "off" && pm.kind === "off";

  const title =
    `${empName} — ${formatHumanDate(iso)}\n` +
    `Matin : ${halfLabel(am)} · Après-midi : ${halfLabel(pm)}\n` +
    `(double-clic : ouvrir le planning de ce jour)`;

  return (
    <div
      className={cn(
        "h-12 px-0.5 py-1 transition-all duration-150 cursor-pointer select-none",
        isHoverCross && "bg-violet-50/40",
        isToday && "bg-violet-50/30"
      )}
      onMouseEnter={onEnter}
      onDoubleClick={() => onOpenDay(iso)}
      title={title}
      aria-label={title}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-md transition-all duration-150",
          bothOff ? "bg-transparent" : "ring-1 ring-inset ring-black/5",
          isHoverExact &&
            "scale-110 shadow-[0_4px_12px_-4px_rgba(124,58,237,0.4)] ring-2 ring-violet-400"
        )}
      >
        {/* Matin (haut) */}
        <HalfBlock state={am} empColor={empColor} isWeekend={isWeekend} />
        {/* Fin séparateur matin / après-midi */}
        <div className="h-px w-full bg-white/70" aria-hidden />
        {/* Après-midi (bas) */}
        <HalfBlock state={pm} empColor={empColor} isWeekend={isWeekend} />
      </div>
    </div>
  );
}

/** Une demi-journée colorée (matin OU après-midi). */
function HalfBlock({
  state,
  empColor,
  isWeekend,
}: {
  state: DayState;
  empColor: string;
  isWeekend: boolean;
}) {
  if (state.kind === "off") {
    return (
      <div
        className="flex-1"
        style={{
          backgroundColor: isWeekend
            ? "rgb(244 244 245 / 0.5)"
            : "rgb(250 250 251 / 0.7)",
        }}
      />
    );
  }
  if (state.kind === "absence") {
    const s = ABSENCE_STYLES[state.code];
    // Hachures diagonales identiques à la vue journalière (PlanningGrid) →
    // signal visuel constant "absence" quelle que soit la vue.
    return (
      <div
        className="flex-1"
        style={{
          backgroundColor: s.bg,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0 1.5px, transparent 1.5px 6px)",
        }}
      />
    );
  }
  // Travaillé : couleur du rôle, opacité modulée par les heures de la
  // demi-journée (une demi-journée pleine ≈ 4h+ → saturation max).
  const intensity = clamp(state.hours / 4, 0.35, 1);
  return (
    <div
      className="flex-1"
      style={{ backgroundColor: hexToRgba(empColor, intensity * 0.78) }}
    />
  );
}

function halfLabel(state: DayState): string {
  if (state.kind === "off") return "—";
  if (state.kind === "absence") return ABSENCE_LABELS[state.code];
  return `${state.hours.toFixed(1)}h`;
}

/* ─── Légende — dépliable via <details> natif ─────────────────────
   Pas d'état React, pas de JS, comportement natif clavier/screen-reader.
   Fermée par défaut → libère l'espace en bas de la vue mois ; click sur
   l'en-tête pour déplier. Chevron animé pour signaler l'interaction. */

function Legend() {
  return (
    <details className="group rounded-xl border border-border/50 bg-card/60 text-[12px] text-foreground/70">
      <summary className="flex items-center gap-2 cursor-pointer list-none px-4 py-2 select-none hover:bg-muted/40 rounded-xl transition-colors">
        <ChevronRight
          className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span className="font-medium text-muted-foreground">
          Légende des couleurs et absences
        </span>
      </summary>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/40 px-4 py-2.5">
        {/* Rappel : chaque case est coupée en deux (haut = matin, bas = a-m). */}
        <span className="inline-flex items-center gap-2">
          <span className="flex h-6 w-4 flex-col overflow-hidden rounded-md ring-1 ring-border">
            <span className="flex-1 bg-violet-400/70" />
            <span className="h-px bg-white/70" />
            <span className="flex-1 bg-violet-400/40" />
          </span>
          Haut = matin · Bas = après-midi
        </span>

        <span className="inline-flex items-center gap-2">
          <span className="flex h-3 overflow-hidden rounded-md ring-1 ring-border">
            {[0.3, 0.5, 0.75, 1].map((a) => (
              <span
                key={a}
                className="h-3 w-3.5"
                // Gradient gris neutre — la VRAIE couleur est celle du rôle
                // (cf. RolesLegend en haut). Ici on montre uniquement que
                // l'intensité reflète le nombre d'heures travaillées.
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
          <span className="h-3 w-3.5 rounded-md bg-muted/40 ring-1 ring-inset ring-border" />
          Repos / Dimanche
        </span>
      </div>
    </details>
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
