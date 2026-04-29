"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ABSENCE_ICONS,
  ABSENCE_STYLES,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_LABELS,
  TIME_SLOTS,
} from "@/types";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import {
  dailyTaskHours,
  staffingForSlot,
  staffingLevel,
  weeklyTaskHours,
  type EmployeeDayMap,
} from "@/lib/planning-utils";
import { ScheduleType, type TaskCode } from "@prisma/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type CellKey = string; // "employeeId|date|timeSlot"

export function makeCellKey(
  employeeId: string,
  date: string,
  timeSlot: string
): CellKey {
  return `${employeeId}|${date}|${timeSlot}`;
}

/** Tooltip lisible avec la répartition par poste pour un créneau donné */
function breakdownLabel(
  date: string,
  slot: string,
  employees: EmployeeDTO[],
  index: Map<string, EmployeeDayMap>
): string {
  const counts = new Map<TaskCode, number>();
  let absences = 0;
  employees.forEach((emp) => {
    const e = index.get(emp.id)?.get(date)?.get(slot);
    if (!e) return;
    if (e.type === ScheduleType.TASK && e.taskCode) {
      counts.set(e.taskCode, (counts.get(e.taskCode) ?? 0) + 1);
    } else if (e.type === ScheduleType.ABSENCE) {
      absences++;
    }
  });
  const parts: string[] = [];
  Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, n]) => parts.push(`${TASK_LABELS[code]} ${n}`));
  if (absences > 0) parts.push(`Abs ${absences}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

type Props = {
  employees: EmployeeDTO[];
  date: string;
  weekDates: string[];
  index: Map<string, EmployeeDayMap>;
  canEdit: boolean;
  minStaff: number;
  selection: Set<CellKey>;
  onSelectionChange: (next: Set<CellKey>) => void;
  onCellClick?: (employeeId: string, date: string, timeSlot: string) => void;
  overtimeCells?: Set<CellKey>;
  /** Cellules fraîchement enregistrées — animation flash temporaire */
  recentlySaved?: Set<CellKey>;
  /** ID de l'Employee correspondant au user connecté — sa colonne sera mise en valeur */
  currentEmployeeId?: string | null;
};

export const PlanningGrid = memo(function PlanningGrid({
  employees,
  date,
  weekDates,
  index,
  canEdit,
  minStaff,
  selection,
  onSelectionChange,
  onCellClick,
  overtimeCells,
  recentlySaved,
  currentEmployeeId,
}: Props) {
  const dragRef = useRef<{
    startEmpIdx: number;
    startSlotIdx: number;
    moved: boolean;
    additive: boolean;
    base: Set<CellKey>;
  } | null>(null);

  // Ref miroir de `selection` pour que les handlers de cellule restent stables
  // (sinon chaque mise à jour de sélection recrée les handlers et re-render
  // toutes les cellules de la grille).
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const employeeIds = useMemo(() => employees.map((e) => e.id), [employees]);

  // Pré-calcule heures jour + heures semaine par collaborateur (utilisées dans le
  // <thead>) — sinon recalculées inline pour chaque cellule d'en-tête à chaque
  // render (selection drag, hover, etc.). 1 seul passage par collaborateur.
  const headerHours = useMemo(() => {
    const map = new Map<string, { dailyH: number; weeklyH: number }>();
    for (const e of employees) {
      map.set(e.id, {
        dailyH: dailyTaskHours(e.id, date, index),
        weeklyH: weeklyTaskHours(e.id, weekDates, index),
      });
    }
    return map;
  }, [employees, date, weekDates, index]);

  // Pré-calcule effectif par créneau (utilisé dans chaque <tr>). Évite de
  // recompter au moindre re-render — c'est ce que faisait l'ancien code à
  // chaque ligne de la grille.
  const slotStaffing = useMemo(() => {
    const map = new Map<string, { staff: number; level: "ok" | "warning" | "critical" }>();
    for (const slot of TIME_SLOTS) {
      const staff = staffingForSlot(date, slot, employeeIds, index);
      map.set(slot, { staff, level: staffingLevel(staff, minStaff) });
    }
    return map;
  }, [date, employeeIds, index, minStaff]);

  const isTodayDisplayed = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return date === `${yyyy}-${mm}-${dd}`;
  }, [date]);

  // Heure courante — recalculée chaque minute uniquement quand on est sur aujourd'hui
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (!isTodayDisplayed) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [isTodayDisplayed]);

  const currentSlotIdx = useMemo(() => {
    if (!isTodayDisplayed) return -1;
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = now.getMinutes() < 30 ? "00" : "30";
    return TIME_SLOTS.indexOf(`${hh}:${mm}`);
  }, [isTodayDisplayed, now]);

  const computeRectKeys = useCallback(
    (eA: number, sA: number, eB: number, sB: number): CellKey[] => {
      const [e1, e2] = eA <= eB ? [eA, eB] : [eB, eA];
      const [s1, s2] = sA <= sB ? [sA, sB] : [sB, sA];
      const keys: CellKey[] = [];
      for (let i = e1; i <= e2; i++) {
        for (let j = s1; j <= s2; j++) {
          keys.push(makeCellKey(employees[i].id, date, TIME_SLOTS[j]));
        }
      }
      return keys;
    },
    [employees, date]
  );

  useEffect(() => {
    if (!canEdit) return;
    function onMouseUp() {
      dragRef.current = null;
    }
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [canEdit]);

  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent, empIdx: number, slotIdx: number) => {
      if (!canEdit) return;
      if (e.button !== 0) return;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      dragRef.current = {
        startEmpIdx: empIdx,
        startSlotIdx: slotIdx,
        moved: false,
        additive,
        base: additive ? new Set(selectionRef.current) : new Set(),
      };
    },
    [canEdit]
  );

  const handleCellMouseEnter = useCallback(
    (empIdx: number, slotIdx: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.moved =
        drag.moved ||
        empIdx !== drag.startEmpIdx ||
        slotIdx !== drag.startSlotIdx;
      if (drag.moved) {
        const rectKeys = computeRectKeys(
          drag.startEmpIdx,
          drag.startSlotIdx,
          empIdx,
          slotIdx
        );
        const next = new Set(drag.base);
        rectKeys.forEach((k) => next.add(k));
        onSelectionChange(next);
      }
    },
    [computeRectKeys, onSelectionChange]
  );

  const handleCellMouseUp = useCallback(
    (empIdx: number, slotIdx: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (
        !drag.moved &&
        !drag.additive &&
        onCellClick &&
        empIdx === drag.startEmpIdx &&
        slotIdx === drag.startSlotIdx
      ) {
        onCellClick(employees[empIdx].id, date, TIME_SLOTS[slotIdx]);
        onSelectionChange(new Set());
      } else if (!drag.moved && drag.additive) {
        const k = makeCellKey(employees[empIdx].id, date, TIME_SLOTS[slotIdx]);
        const next = new Set(selectionRef.current);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        onSelectionChange(next);
      }
    },
    [onCellClick, employees, date, onSelectionChange]
  );

  if (employees.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200/70 bg-white/60 backdrop-blur-sm p-12 text-center">
        <p className="text-sm text-zinc-500">
          Aucun collaborateur actif. Ajoutez des collaborateurs pour commencer.
        </p>
      </div>
    );
  }

  // Largeur minimum garantie par colonne employé (lisibilité tactile mobile).
  // Si l'écran est plus large, les colonnes s'étirent pour remplir.
  const minTableWidth = employees.length * 72 + 96; // 72px / employé + 52 (heure) + 44 (staffing)

  return (
    <div className="select-none rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin overscroll-x-contain">
        <table
          className="w-full border-collapse text-[12px]"
          style={{ tableLayout: "fixed", minWidth: `${minTableWidth}px` }}
        >
          <colgroup>
            <col style={{ width: "52px" }} />
            {employees.map((emp) => (
              <col key={emp.id} />
            ))}
            <col style={{ width: "44px" }} />
          </colgroup>
          <thead>
            {/* Ligne unique : nom · statut · contrat · jour · semaine */}
            <tr className="bg-white/80 backdrop-blur-md">
              <th className="sticky left-0 z-20 bg-white/95 backdrop-blur-md px-3 py-3 text-left w-16 min-w-16 align-bottom">
                <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-zinc-400">
                  Heure
                </span>
              </th>
              {employees.map((e) => {
                const h = headerHours.get(e.id);
                const dailyH = h?.dailyH ?? 0;
                const weeklyH = h?.weeklyH ?? 0;
                const delta = weeklyH - e.weeklyHours;

                const isMe = !!currentEmployeeId && e.id === currentEmployeeId;

                return (
                  <th
                    key={e.id}
                    className={cn(
                      "px-1 pt-2.5 pb-2 align-top overflow-hidden relative",
                      // Lane "ma colonne" — cream warm très subtil, façon Apple Notes
                      isMe &&
                        "bg-gradient-to-b from-amber-50/70 via-amber-50/40 to-transparent"
                    )}
                    title={`${e.firstName} ${e.lastName} · ${STATUS_LABELS[e.status]} · contrat ${e.weeklyHours}h · jour ${dailyH.toFixed(1)}h · semaine ${weeklyH.toFixed(1)}h${
                      Math.abs(delta) >= 0.5 ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(1)}h)` : ""
                    }`}
                  >
                    <div className="flex flex-col items-stretch gap-0.5 min-w-0">
                      {/* Nom + pastille couleur (légèrement renforcés sur ma colonne) */}
                      <div className="flex items-center gap-1 justify-center min-w-0">
                        <span
                          aria-hidden
                          className={cn(
                            "rounded-full shrink-0",
                            isMe ? "h-2 w-2 ring-2 ring-white" : "h-1.5 w-1.5"
                          )}
                          style={{ background: e.displayColor }}
                        />
                        <span
                          className={cn(
                            "truncate text-[12px] tracking-tight text-zinc-900",
                            isMe ? "font-semibold" : "font-semibold"
                          )}
                        >
                          {e.firstName}
                        </span>
                      </div>
                      {/* Statut */}
                      <span className="text-[9px] uppercase tracking-[0.04em] text-zinc-400 font-medium text-center truncate">
                        {STATUS_LABELS[e.status]}
                      </span>
                      {/* Stats compactes : jour · cumul (delta) */}
                      <div className="mt-0.5 flex items-center justify-center gap-0.5 font-mono text-[9.5px] text-zinc-500 truncate tabular-nums">
                        <span className="text-zinc-700">
                          {dailyH.toFixed(1)}
                        </span>
                        <span className="text-zinc-300 mx-0.5">›</span>
                        <span
                          className={cn(
                            "font-medium",
                            Math.abs(delta) < 0.5
                              ? "text-zinc-700"
                              : delta > 0
                                ? "text-rose-600"
                                : "text-amber-600"
                          )}
                        >
                          {weeklyH.toFixed(1)}
                          {Math.abs(delta) >= 0.5 && (
                            <span className="ml-0.5">
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(0)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </th>
                );
              })}
              <th className="sticky right-0 z-20 bg-white/95 backdrop-blur-md px-3 py-3 w-12 min-w-12 align-bottom">
                <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-zinc-400">
                  Eff
                </span>
              </th>
            </tr>
            {/* Filet séparateur */}
            <tr aria-hidden>
              <th
                colSpan={employees.length + 2}
                className="h-px p-0 bg-gradient-to-r from-transparent via-zinc-200 to-transparent"
              />
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((slot, slotIdx) => {
              const isHourMark = slot.endsWith(":00");
              const staffData = slotStaffing.get(slot);
              const staff = staffData?.staff ?? 0;
              const level = staffData?.level ?? "ok";
              const isCurrent = slotIdx === currentSlotIdx;
              return (
                <tr
                  key={slot}
                  className={cn(
                    "group/row transition-colors",
                    isHourMark && "border-t border-t-zinc-100"
                  )}
                  style={
                    isCurrent
                      ? { boxShadow: "inset 0 1.5px 0 0 rgb(244 63 94 / 0.85)" }
                      : undefined
                  }
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-white px-3 py-1 font-mono text-right tabular-nums select-none",
                      isHourMark
                        ? "text-zinc-900 font-semibold"
                        : "text-zinc-300 text-[10.5px]",
                      isCurrent && "text-rose-600 font-semibold"
                    )}
                  >
                    {isCurrent && (
                      <span className="absolute -left-0.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-rose-100" />
                    )}
                    {slot}
                  </td>
                  {employees.map((emp, empIdx) => {
                    const entry = index.get(emp.id)?.get(date)?.get(slot) ?? null;
                    const prevSlot = slotIdx > 0 ? TIME_SLOTS[slotIdx - 1] : null;
                    const prevEntry = prevSlot
                      ? index.get(emp.id)?.get(date)?.get(prevSlot) ?? null
                      : null;
                    const nextSlot =
                      slotIdx < TIME_SLOTS.length - 1
                        ? TIME_SLOTS[slotIdx + 1]
                        : null;
                    const nextEntry = nextSlot
                      ? index.get(emp.id)?.get(date)?.get(nextSlot) ?? null
                      : null;
                    const key = makeCellKey(emp.id, date, slot);
                    const isSelected = selection.has(key);
                    const isOvertime = overtimeCells?.has(key) ?? false;
                    const isRecent = recentlySaved?.has(key) ?? false;
                    const isMyColumn =
                      !!currentEmployeeId && emp.id === currentEmployeeId;
                    // Voisins en heures sup → utilisé pour fermer le haut/bas
                    // de la "colonne" rouge proprement.
                    const prevOvertime = !!prevSlot &&
                      (overtimeCells?.has(makeCellKey(emp.id, date, prevSlot)) ?? false);
                    const nextOvertime = !!nextSlot &&
                      (overtimeCells?.has(makeCellKey(emp.id, date, nextSlot)) ?? false);
                    return (
                      <Cell
                        key={emp.id}
                        empIdx={empIdx}
                        slotIdx={slotIdx}
                        entry={entry}
                        prevEntry={prevEntry}
                        nextEntry={nextEntry}
                        canEdit={canEdit}
                        isSelected={isSelected}
                        isOvertime={isOvertime}
                        isPrevOvertime={prevOvertime}
                        isNextOvertime={nextOvertime}
                        isRecent={isRecent}
                        isMyColumn={isMyColumn}
                        onMouseDown={handleCellMouseDown}
                        onMouseEnter={handleCellMouseEnter}
                        onMouseUp={handleCellMouseUp}
                      />
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-white px-2 py-1 text-center select-none">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            "inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums cursor-help",
                            level === "ok" && "bg-emerald-50 text-emerald-700",
                            level === "warning" && "bg-amber-50 text-amber-700",
                            level === "critical" && "bg-rose-50 text-rose-700"
                          )}
                        >
                          {staff}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[11px]">
                        {breakdownLabel(date, slot, employees, index)}
                      </TooltipContent>
                    </Tooltip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*                            Cell component                           */
/* ------------------------------------------------------------------ */

const Cell = memo(function Cell({
  empIdx,
  slotIdx,
  entry,
  prevEntry,
  nextEntry,
  canEdit,
  isSelected,
  isOvertime,
  isPrevOvertime,
  isNextOvertime,
  isRecent,
  isMyColumn,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
}: {
  empIdx: number;
  slotIdx: number;
  entry: ScheduleEntryDTO | null;
  prevEntry: ScheduleEntryDTO | null;
  nextEntry: ScheduleEntryDTO | null;
  canEdit: boolean;
  isSelected: boolean;
  isOvertime: boolean;
  isPrevOvertime: boolean;
  isNextOvertime: boolean;
  isRecent: boolean;
  isMyColumn: boolean;
  onMouseDown: (e: React.MouseEvent, empIdx: number, slotIdx: number) => void;
  onMouseEnter: (empIdx: number, slotIdx: number) => void;
  onMouseUp: (empIdx: number, slotIdx: number) => void;
}) {
  const isContinuation =
    !!entry &&
    !!prevEntry &&
    entry.type === prevEntry.type &&
    entry.taskCode === prevEntry.taskCode &&
    entry.absenceCode === prevEntry.absenceCode;

  const isLastOfBlock =
    !!entry &&
    (!nextEntry ||
      entry.type !== nextEntry.type ||
      entry.taskCode !== nextEntry.taskCode ||
      entry.absenceCode !== nextEntry.absenceCode);

  const baseClasses = cn(
    "px-1 h-9 text-center font-medium text-[11px] transition-all relative",
    canEdit && "cursor-pointer",
    isSelected && "ring-2 ring-violet-500/80 ring-inset z-[5]",
    isRecent && "animate-cell-flash"
  );

  const handlers = canEdit
    ? {
        onMouseDown: (e: React.MouseEvent) => onMouseDown(e, empIdx, slotIdx),
        onMouseEnter: () => onMouseEnter(empIdx, slotIdx),
        onMouseUp: () => onMouseUp(empIdx, slotIdx),
      }
    : {};

  // Wash cream/warm-neutral très subtil — colore toute la colonne du user
  // connecté façon "lane Apple Notes". Quasi imperceptible sur les couleurs
  // de postes mais suffisant pour scanner sa colonne d'un coup d'œil.
  const myColumnWash = "rgba(252, 211, 77, 0.08)"; // amber-300 @ 8%

  // Cellule vide — ultra-minimal, juste un hover discret + wash warm doux
  if (!entry) {
    return (
      <td
        {...handlers}
        className={cn(
          baseClasses,
          "border-b border-b-zinc-100/80",
          canEdit && "hover:bg-zinc-50/80",
          isMyColumn && "bg-amber-50/50"
        )}
        aria-label="Vide"
      />
    );
  }

  // Heures sup → cadre rouge continu sur toute la colonne (de la première
  // case en HS à la dernière). On dessine les bordures latérales sur chaque
  // case et on ferme le haut/bas seulement pour la 1re et la dernière case
  // de la séquence — résultat : un rectangle rouge unique, plus lisible
  // qu'un ring par case.
  const overtimeBorders = (() => {
    if (!isOvertime) return undefined;
    const RED = "rgb(220 38 38 / 0.9)";
    const parts = [
      `inset 2px 0 0 ${RED}`, // gauche
      `inset -2px 0 0 ${RED}`, // droite
    ];
    if (!isPrevOvertime) parts.push(`inset 0 2px 0 ${RED}`); // haut (1re case HS)
    if (!isNextOvertime) parts.push(`inset 0 -2px 0 ${RED}`); // bas (dernière case HS)
    return parts.join(", ");
  })();

  // Wash rouge translucide qu'on superpose à la couleur du poste, pour que
  // l'œil identifie immédiatement la zone "hors contrat".
  const overtimeWash = "rgba(239, 68, 68, 0.14)";

  // Tâche : bloc unifié, label uniquement au début du bloc
  if (entry.type === "TASK" && entry.taskCode) {
    const c = TASK_COLORS[entry.taskCode];
    // On empile les washes (overtime + ma colonne) sur la couleur du poste.
    // L'ordre : couleur du poste en bas, washes par-dessus.
    const overlays: string[] = [];
    if (isOvertime) overlays.push(`linear-gradient(${overtimeWash}, ${overtimeWash})`);
    if (isMyColumn) overlays.push(`linear-gradient(${myColumnWash}, ${myColumnWash})`);
    const background =
      overlays.length > 0 ? `${overlays.join(", ")}, ${c.bg}` : c.bg;
    return (
      <td
        {...handlers}
        className={cn(baseClasses, isLastOfBlock && "border-b border-b-white")}
        style={{
          background,
          color: c.text,
          boxShadow: overtimeBorders,
        }}
        title={
          isOvertime
            ? `${TASK_LABELS[entry.taskCode]} · heure supp.`
            : TASK_LABELS[entry.taskCode]
        }
      >
        {!isContinuation && (
          <span className="inline-flex items-center gap-0.5 tracking-tight">
            {TASK_LABELS[entry.taskCode]}
            {/* Indicateur "+xh" affiché uniquement sur la 1re case HS */}
            {isOvertime && !isPrevOvertime && (
              <span className="text-[9px] font-bold text-red-700">+sup</span>
            )}
          </span>
        )}
      </td>
    );
  }

  // Absence : couleur + hachures diagonales (pour visibilité immédiate)
  if (entry.type === "ABSENCE" && entry.absenceCode) {
    const s = ABSENCE_STYLES[entry.absenceCode];
    // On stack hachures + wash violet (si ma colonne) au-dessus de la couleur
    const layers = [
      "repeating-linear-gradient(45deg, rgba(0,0,0,0.16) 0 1.5px, transparent 1.5px 6px)",
    ];
    if (isMyColumn) {
      layers.push(`linear-gradient(${myColumnWash}, ${myColumnWash})`);
    }
    return (
      <td
        {...handlers}
        className={cn(baseClasses, isLastOfBlock && "border-b border-b-white")}
        style={{
          backgroundColor: s.bg,
          backgroundImage: layers.join(", "),
          color: s.text,
        }}
        title={`Absence ${entry.absenceCode}`}
      >
        {!isContinuation && ABSENCE_ICONS[entry.absenceCode]}
      </td>
    );
  }

  return (
    <td
      {...handlers}
      className={cn(baseClasses, isMyColumn && "bg-amber-50/50")}
    />
  );
});
