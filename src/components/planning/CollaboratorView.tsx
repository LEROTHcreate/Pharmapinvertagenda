"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowLeft, Calendar } from "lucide-react";
import type { EmployeeStatus, AbsenceCode, TaskCode } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_LABELS,
  TIME_SLOTS,
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
} from "@/types";
import type { ScheduleEntryDTO } from "@/types";
import {
  startOfWeek,
  toIsoDate,
  weekDays,
  isoWeekNumber,
} from "@/lib/planning-utils";
import { holidaysIndexForDates } from "@/lib/holidays-fr";

type Collaborator = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: number;
  displayColor: string;
  isActive: boolean;
};

type Props = {
  collaborator: Collaborator;
  entries: ScheduleEntryDTO[];
  view: "week" | "month";
  weekStart: string | null;
  month: string | null;
};

export function CollaboratorView({
  collaborator,
  entries,
  view,
  weekStart,
  month,
}: Props) {
  const router = useRouter();

  /* ─── URLs de navigation ─────────────────────────────────────── */
  function urlForWeek(weekStartIso: string) {
    return `/planning/collaborateur/${collaborator.id}?view=week&week=${weekStartIso}`;
  }
  function urlForMonth(monthIso: string) {
    return `/planning/collaborateur/${collaborator.id}?view=month&month=${monthIso}`;
  }

  /* ─── Rendu de l'en-tête commun (titre, statut, contrat) ─────── */
  const Header = (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <Link
          href="/planning"
          className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground/85 transition-colors mb-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour au planning de l'équipe
        </Link>
        <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full ring-2 ring-white"
            style={{ background: collaborator.displayColor }}
          />
          {collaborator.firstName}
          {collaborator.lastName !== "—" && ` ${collaborator.lastName}`}
        </h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {STATUS_LABELS[collaborator.status]} · contrat{" "}
          <span className="font-medium tabular-nums text-foreground/85">
            {collaborator.weeklyHours}h
          </span>
          /sem
          {!collaborator.isActive && (
            <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Inactif
            </span>
          )}
        </p>
      </div>

      {/* Toggle Semaine / Mois */}
      <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
        <button
          onClick={() =>
            router.replace(
              urlForWeek(weekStart ?? toIsoDate(startOfWeek(new Date()))),
              { scroll: false }
            )
          }
          className={cn(
            "h-8 px-3 rounded-full text-[12.5px] font-medium transition-colors",
            view === "week"
              ? "bg-violet-100 text-violet-700"
              : "text-foreground/70 hover:bg-muted"
          )}
        >
          Semaine
        </button>
        <button
          onClick={() => {
            const now = new Date();
            const m =
              month ??
              `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            router.replace(urlForMonth(m), { scroll: false });
          }}
          className={cn(
            "h-8 px-3 rounded-full text-[12.5px] font-medium transition-colors",
            view === "month"
              ? "bg-violet-100 text-violet-700"
              : "text-foreground/70 hover:bg-muted"
          )}
        >
          Mois
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5">
      {Header}
      {view === "week" ? (
        <WeekView
          collaborator={collaborator}
          entries={entries}
          weekStart={weekStart}
          urlForWeek={urlForWeek}
        />
      ) : (
        <MonthView
          collaborator={collaborator}
          entries={entries}
          month={month}
          urlForMonth={urlForMonth}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *                       VUE SEMAINE
 * ════════════════════════════════════════════════════════════════ */

function WeekView({
  collaborator,
  entries,
  weekStart,
  urlForWeek,
}: {
  collaborator: Collaborator;
  entries: ScheduleEntryDTO[];
  weekStart: string | null;
  urlForWeek: (iso: string) => string;
}) {
  const router = useRouter();

  const monday = useMemo(
    () =>
      weekStart ? new Date(`${weekStart}T00:00:00`) : startOfWeek(new Date()),
    [weekStart]
  );
  const days = useMemo(() => weekDays(monday), [monday]);
  const dayDates = useMemo(() => days.map(toIsoDate), [days]);
  const weekNumber = isoWeekNumber(monday);

  // Map (date → timeSlot → entry)
  const byDate = useMemo(() => {
    const m = new Map<string, Map<string, ScheduleEntryDTO>>();
    for (const e of entries) {
      let day = m.get(e.date);
      if (!day) {
        day = new Map();
        m.set(e.date, day);
      }
      day.set(e.timeSlot, e);
    }
    return m;
  }, [entries]);

  function navigate(delta: number) {
    const next = new Date(monday);
    next.setDate(next.getDate() + delta * 7);
    router.replace(urlForWeek(toIsoDate(next)), { scroll: false });
  }

  function goToday() {
    router.replace(urlForWeek(toIsoDate(startOfWeek(new Date()))), {
      scroll: false,
    });
  }

  // Calcul de l'horaire d'ouverture observé (premier slot rempli → dernier
  // slot rempli) — sinon 08:00–19:00 par défaut.
  const { firstSlot, lastSlot } = useMemo(() => {
    let first = TIME_SLOTS.length;
    let last = 0;
    for (const e of entries) {
      const idx = TIME_SLOTS.indexOf(e.timeSlot);
      if (idx >= 0) {
        if (idx < first) first = idx;
        if (idx > last) last = idx;
      }
    }
    if (first > last) return { firstSlot: "08:00", lastSlot: "19:00" };
    // Petite marge avant et après pour la lisibilité
    const f = Math.max(0, first - 1);
    const l = Math.min(TIME_SLOTS.length - 1, last + 1);
    return { firstSlot: TIME_SLOTS[f], lastSlot: TIME_SLOTS[l] };
  }, [entries]);

  const visibleSlots = useMemo(
    () => TIME_SLOTS.filter((s) => s >= firstSlot && s <= lastSlot),
    [firstSlot, lastSlot]
  );

  /* ─── Heures totales ─────────────────────────────────────────── */
  let totalHoursWeek = 0;
  const hoursByDay = new Map<string, number>();
  for (const date of dayDates) {
    let h = 0;
    const dayMap = byDate.get(date);
    if (dayMap) {
      for (const e of dayMap.values()) {
        if (e.type === "TASK") h += 0.5;
      }
    }
    hoursByDay.set(date, h);
    totalHoursWeek += h;
  }
  const delta = totalHoursWeek - collaborator.weeklyHours;

  return (
    <div className="space-y-4">
      {/* Bandeau navigation + récap */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
          <button
            onClick={() => navigate(-1)}
            className="h-8 w-8 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-muted transition-colors"
            aria-label="Semaine précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="h-8 px-3 rounded-full text-[12.5px] font-medium text-foreground/85 hover:bg-muted transition-colors"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => navigate(1)}
            className="h-8 w-8 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-muted transition-colors"
            aria-label="Semaine suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">
            Semaine {weekNumber}
          </span>{" "}
          · {days[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
          {" – "}
          {days[5].toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
        </div>
        <div className="ml-auto rounded-2xl border border-border/70 bg-card px-4 py-2 text-[13px]">
          <span className="text-muted-foreground">Total semaine&nbsp;:</span>{" "}
          <span className="font-semibold tabular-nums">
            {totalHoursWeek.toFixed(1)}h
          </span>
          {Math.abs(delta) >= 0.5 && (
            <span
              className={cn(
                "ml-1.5 tabular-nums text-[12px]",
                delta > 0 ? "text-rose-600" : "text-amber-600"
              )}
            >
              ({delta > 0 ? "+" : ""}
              {delta.toFixed(1)}h vs contrat)
            </span>
          )}
        </div>
      </div>

      {/* Grille semaine pour ce collaborateur — ligne = créneau, colonne = jour */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "60px" }} />
              {days.map((d, i) => (
                <col key={i} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-card">
                <th className="px-3 py-3 text-left">
                  <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground/70">
                    Heure
                  </span>
                </th>
                {days.map((d, i) => {
                  const iso = dayDates[i];
                  const isToday = iso === toIsoDate(new Date());
                  const dayH = hoursByDay.get(iso) ?? 0;
                  return (
                    <th
                      key={i}
                      className={cn(
                        "px-2 py-3 align-bottom",
                        isToday && "bg-violet-50/40"
                      )}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70 font-medium">
                          <span className="hidden sm:inline">{WEEK_DAYS[i]}</span>
                          <span className="sm:hidden">{WEEK_DAYS_SHORT[i]}</span>
                        </span>
                        <span
                          className={cn(
                            "text-[14px] font-semibold tabular-nums",
                            isToday ? "text-violet-700" : "text-foreground"
                          )}
                        >
                          {d.getDate().toString().padStart(2, "0")}/
                          {(d.getMonth() + 1).toString().padStart(2, "0")}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                          {dayH.toFixed(1)}h
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
              <tr aria-hidden>
                <th
                  colSpan={days.length + 1}
                  className="h-px p-0 bg-gradient-to-r from-transparent via-zinc-200 to-transparent"
                />
              </tr>
            </thead>
            <tbody>
              {visibleSlots.map((slot, slotIdx) => {
                const isHourMark = slot.endsWith(":00");
                return (
                  <tr
                    key={slot}
                    className={isHourMark ? "border-t border-t-zinc-100" : ""}
                  >
                    <td className="px-3 py-1 font-mono text-right tabular-nums select-none">
                      <span
                        className={cn(
                          isHourMark
                            ? "text-foreground/85 font-semibold text-[12px]"
                            : "text-muted-foreground/40 text-[10.5px]"
                        )}
                      >
                        {slot}
                      </span>
                    </td>
                    {days.map((_, dayIdx) => {
                      const iso = dayDates[dayIdx];
                      const entry = byDate.get(iso)?.get(slot) ?? null;
                      const prevEntry =
                        slotIdx > 0
                          ? byDate.get(iso)?.get(visibleSlots[slotIdx - 1]) ??
                            null
                          : null;
                      const isContinuation =
                        !!entry &&
                        !!prevEntry &&
                        entry.type === prevEntry.type &&
                        entry.taskCode === prevEntry.taskCode &&
                        entry.absenceCode === prevEntry.absenceCode;
                      return (
                        <Cell
                          key={dayIdx}
                          entry={entry}
                          isContinuation={isContinuation}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Légende compacte */}
      <Legend />
    </div>
  );
}

function Cell({
  entry,
  isContinuation,
}: {
  entry: ScheduleEntryDTO | null;
  isContinuation: boolean;
}) {
  if (!entry) {
    return <td className="border-r border-r-zinc-50 h-7 px-1" />;
  }
  if (entry.type === "TASK" && entry.taskCode) {
    const c = TASK_COLORS[entry.taskCode];
    return (
      <td
        className="h-7 px-1.5 text-[11.5px] font-medium text-center align-middle"
        style={{
          background: c.bg,
          color: c.text,
          borderTop: isContinuation ? `1px dashed ${c.border}` : undefined,
        }}
        title={TASK_LABELS[entry.taskCode]}
      >
        {!isContinuation && (
          <span className="truncate block">{TASK_LABELS[entry.taskCode]}</span>
        )}
      </td>
    );
  }
  if (entry.type === "ABSENCE" && entry.absenceCode) {
    const s = ABSENCE_STYLES[entry.absenceCode];
    return (
      <td
        className="h-7 px-1.5 text-[11.5px] font-medium text-center align-middle italic"
        style={{
          backgroundColor: s.bg,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.16) 0 1.5px, transparent 1.5px 6px)",
          color: s.text,
          borderTop: isContinuation ? `1px dashed ${s.border}` : undefined,
        }}
        title={`Absence ${entry.absenceCode}`}
      >
        {!isContinuation && ABSENCE_LABELS[entry.absenceCode]}
      </td>
    );
  }
  return <td className="h-7 px-1" />;
}

/* ════════════════════════════════════════════════════════════════
 *                       VUE MOIS
 * ════════════════════════════════════════════════════════════════ */

function MonthView({
  collaborator: _collaborator,
  entries,
  month,
  urlForMonth,
}: {
  collaborator: Collaborator;
  entries: ScheduleEntryDTO[];
  month: string | null;
  urlForMonth: (iso: string) => string;
}) {
  const router = useRouter();

  const { year, monthIdx } = useMemo(() => {
    const m = month?.match(/^(\d{4})-(\d{2})$/);
    if (m) return { year: Number(m[1]), monthIdx: Number(m[2]) - 1 };
    const now = new Date();
    return { year: now.getFullYear(), monthIdx: now.getMonth() };
  }, [month]);

  const monthLabel = new Date(year, monthIdx, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  // Génère la grille calendrier (lundi=premier jour de semaine).
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, monthIdx, 1));
    const last = new Date(Date.UTC(year, monthIdx + 1, 0));
    const firstDow = (first.getUTCDay() + 6) % 7; // lundi = 0
    const lastDow = (last.getUTCDay() + 6) % 7;
    const daysBefore = firstDow;
    const daysAfter = 6 - lastDow;
    const totalDays = daysBefore + last.getUTCDate() + daysAfter;
    const rows: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(first);
      d.setUTCDate(first.getUTCDate() - daysBefore + i);
      rows.push({
        date: d,
        iso: toIsoDate(d),
        inMonth: d.getUTCMonth() === monthIdx,
      });
    }
    return rows;
  }, [year, monthIdx]);

  // Agrégation par jour : heures + tâche dominante + statut absent
  const summaryByDate = useMemo(() => {
    const m = new Map<
      string,
      {
        taskHours: number;
        absent: AbsenceCode | null;
        dominantTask: TaskCode | null;
      }
    >();
    const taskCountsByDate = new Map<string, Map<TaskCode, number>>();
    for (const e of entries) {
      let s = m.get(e.date);
      if (!s) {
        s = { taskHours: 0, absent: null, dominantTask: null };
        m.set(e.date, s);
      }
      if (e.type === "TASK" && e.taskCode) {
        s.taskHours += 0.5;
        let counts = taskCountsByDate.get(e.date);
        if (!counts) {
          counts = new Map();
          taskCountsByDate.set(e.date, counts);
        }
        counts.set(e.taskCode, (counts.get(e.taskCode) ?? 0) + 1);
      } else if (e.type === "ABSENCE" && e.absenceCode) {
        s.absent = e.absenceCode;
      }
    }
    // Détermine la tâche dominante (max count)
    for (const [date, counts] of taskCountsByDate.entries()) {
      let best: TaskCode | null = null;
      let bestN = 0;
      for (const [code, n] of counts.entries()) {
        if (n > bestN) {
          best = code;
          bestN = n;
        }
      }
      const s = m.get(date);
      if (s) s.dominantTask = best;
    }
    return m;
  }, [entries]);

  function navigate(delta: number) {
    const next = new Date(year, monthIdx + delta, 1);
    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    router.replace(urlForMonth(iso), { scroll: false });
  }

  function goToday() {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    router.replace(urlForMonth(iso), { scroll: false });
  }

  // Total mois
  let totalHoursMonth = 0;
  for (const s of summaryByDate.values()) totalHoursMonth += s.taskHours;

  const todayIso = toIsoDate(new Date());

  // Index des jours fériés couvrant les cellules visibles (fin/début mois
  // adjacents inclus pour ne pas perdre un Lundi de Pâques en bord de page)
  const holidaysIndex = useMemo(
    () => holidaysIndexForDates(cells.map((c) => c.iso)),
    [cells]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
          <button
            onClick={() => navigate(-1)}
            className="h-8 w-8 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-muted transition-colors"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="h-8 px-3 rounded-full text-[12.5px] font-medium text-foreground/85 hover:bg-muted transition-colors"
          >
            Ce mois-ci
          </button>
          <button
            onClick={() => navigate(1)}
            className="h-8 w-8 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-muted transition-colors"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="text-[14px] font-medium capitalize text-foreground">
          <Calendar className="inline h-4 w-4 mr-1.5 text-muted-foreground/70" />
          {monthLabel}
        </div>
        <div className="ml-auto rounded-2xl border border-border/70 bg-card px-4 py-2 text-[13px]">
          <span className="text-muted-foreground">Total mois&nbsp;:</span>{" "}
          <span className="font-semibold tabular-nums">
            {totalHoursMonth.toFixed(1)}h
          </span>
        </div>
      </div>

      {/* Grille calendrier */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* En-tête jours */}
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/40">
          {[...WEEK_DAYS_SHORT, "Dim"].map((d, i) => (
            <div
              key={i}
              className={cn(
                "px-2 py-2 text-[10.5px] uppercase tracking-wide font-medium text-center",
                i === 6 ? "text-muted-foreground/40" : "text-muted-foreground"
              )}
            >
              {d}
            </div>
          ))}
        </div>
        {/* Cellules */}
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            const summary = summaryByDate.get(c.iso);
            const isToday = c.iso === todayIso;
            const isAbsent = !!summary?.absent;
            const dominant = summary?.dominantTask ?? null;
            const dominantColors = dominant ? TASK_COLORS[dominant] : null;
            const hours = summary?.taskHours ?? 0;
            const isWeekend = i % 7 === 6; // dimanche
            const holiday = holidaysIndex.get(c.iso) ?? null;

            return (
              <div
                key={i}
                title={holiday && c.inMonth ? `${holiday.name} (jour férié)` : undefined}
                className={cn(
                  "relative min-h-[78px] md:min-h-[92px] p-1.5 border-r border-b border-border/60",
                  !c.inMonth && "bg-muted/40 text-muted-foreground/40",
                  isWeekend && c.inMonth && "bg-muted/40",
                  // Jour férié dans le mois : fond rosé subtil
                  holiday && c.inMonth && "bg-rose-50/40",
                  isToday && "ring-2 ring-inset ring-violet-300"
                )}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      "text-[12px] font-semibold tabular-nums",
                      isToday
                        ? "text-violet-700"
                        : holiday && c.inMonth
                          ? "text-rose-700"
                          : c.inMonth
                            ? "text-foreground/85"
                            : "text-muted-foreground/40"
                    )}
                  >
                    {c.date.getUTCDate()}
                  </span>
                  {c.inMonth && hours > 0 && !isAbsent && (
                    <span className="text-[10.5px] font-mono tabular-nums text-muted-foreground">
                      {hours.toFixed(1)}h
                    </span>
                  )}
                </div>

                {/* Étiquette férié — apparaît au-dessus du bloc poste/absence */}
                {holiday && c.inMonth && (
                  <div className="mt-0.5 text-[9.5px] font-medium uppercase tracking-wide text-rose-600/80 truncate">
                    {holiday.short}
                  </div>
                )}

                {c.inMonth && isAbsent && summary?.absent && (
                  <div
                    className="mt-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium italic text-center"
                    style={{
                      backgroundColor: ABSENCE_STYLES[summary.absent].bg,
                      backgroundImage:
                        "repeating-linear-gradient(45deg, rgba(0,0,0,0.14) 0 1.5px, transparent 1.5px 5px)",
                      color: ABSENCE_STYLES[summary.absent].text,
                    }}
                  >
                    {ABSENCE_LABELS[summary.absent]}
                  </div>
                )}

                {c.inMonth && !isAbsent && dominant && dominantColors && (
                  <div
                    className="mt-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium text-center truncate"
                    style={{
                      background: dominantColors.bg,
                      color: dominantColors.text,
                    }}
                    title={TASK_LABELS[dominant]}
                  >
                    {TASK_LABELS[dominant]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Legend />
    </div>
  );
}

/* ─── Légende ───────────────────────────────────────────────── */

function Legend() {
  const codes = (Object.keys(TASK_LABELS) as TaskCode[]).slice(0, 8);
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
      <span className="text-muted-foreground/70 uppercase tracking-wide font-medium mr-1">
        Légende&nbsp;:
      </span>
      {codes.map((c) => {
        const colors = TASK_COLORS[c];
        return (
          <span
            key={c}
            className="inline-flex items-center rounded px-1.5 py-0.5 font-medium"
            style={{ background: colors.bg, color: colors.text }}
          >
            {TASK_LABELS[c]}
          </span>
        );
      })}
      <span
        className="inline-flex items-center rounded px-1.5 py-0.5 font-medium italic"
        style={{
          backgroundColor: "#fef9c3",
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.14) 0 1.5px, transparent 1.5px 5px)",
          color: "#854d0e",
        }}
      >
        Absence
      </span>
    </div>
  );
}
