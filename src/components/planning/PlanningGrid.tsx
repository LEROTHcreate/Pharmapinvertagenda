"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
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

export type ParsedCell = {
  employeeId: string;
  date: string;
  timeSlot: string;
};

function parseCellKey(k: CellKey): ParsedCell {
  const [employeeId, date, timeSlot] = k.split("|");
  return { employeeId, date, timeSlot };
}

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
  /**
   * Quand fourni + canEdit, active le drag & drop : l'admin peut traîner une
   * cellule TASK vers une autre cellule (vide ou TASK). Les cellules ABSENCE
   * ne sont ni source ni cible. Le parent gère la mutation (mise à jour
   * optimiste + appel API + rollback en cas d'échec).
   */
  onMoveTask?: (source: ParsedCell, target: ParsedCell) => void;
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
  onMoveTask,
}: Props) {
  const dndEnabled = canEdit && !!onMoveTask;

  // Pointer (souris/stylet) avec un seuil de 6px pour distinguer click vs drag.
  // TouchSensor avec un délai de 200 ms : on évite que le scroll vertical du
  // tableau sur tablette ne déclenche un drag par accident.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!onMoveTask) return;
      const { active, over } = event;
      if (!over || !active) return;
      if (active.id === over.id) return;
      onMoveTask(
        parseCellKey(active.id as string),
        parseCellKey(over.id as string)
      );
    },
    [onMoveTask]
  );
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

  // Effectif comptoir : on ne compte QUE pharmaciens + préparateurs.
  // Les livreurs, secrétaires, back-office, étudiants… ne couvrent pas le
  // comptoir → exclus du compteur "min" affiché à droite de la grille.
  const counterStaff = useMemo(
    () =>
      employees.filter(
        (e) => e.status === "PHARMACIEN" || e.status === "PREPARATEUR"
      ),
    [employees]
  );
  const counterStaffIds = useMemo(
    () => counterStaff.map((e) => e.id),
    [counterStaff]
  );

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
      const staff = staffingForSlot(date, slot, counterStaffIds, index);
      map.set(slot, { staff, level: staffingLevel(staff, minStaff) });
    }
    return map;
  }, [date, counterStaffIds, index, minStaff]);

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
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-12 text-center">
        <p className="text-sm text-muted-foreground">
          Aucun collaborateur actif. Ajoutez des collaborateurs pour commencer.
        </p>
      </div>
    );
  }

  // Largeur minimum garantie par colonne employé (lisibilité tactile mobile).
  // Si l'écran est plus large, les colonnes s'étirent pour remplir.
  const minTableWidth = employees.length * 72 + 96; // 72px / employé + 52 (heure) + 44 (staffing)

  const grid = (
    <div className="select-none rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
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
            <tr className="bg-card/80 backdrop-blur-md">
              <th className="sticky left-0 z-20 bg-card/95 backdrop-blur-md px-3 py-3 text-left w-16 min-w-16 align-bottom">
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
                    } — Cliquer pour voir son planning`}
                  >
                    {/* Lien vers la fiche planning du collaborateur — la
                        plage horaire reprend la semaine courante */}
                    <Link
                      href={`/planning/collaborateur/${e.id}?view=week&week=${weekDates[0] ?? ""}`}
                      className="flex flex-col items-stretch gap-0.5 min-w-0 rounded-md px-1 -mx-1 py-1 -my-1 hover:bg-zinc-50 transition-colors cursor-pointer"
                    >
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
                    </Link>
                  </th>
                );
              })}
              <th className="sticky right-0 z-20 bg-card/95 backdrop-blur-md px-3 py-3 w-12 min-w-12 align-bottom">
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
                  className="group/row transition-colors"
                  style={
                    isCurrent
                      ? { boxShadow: "inset 0 1.5px 0 0 rgb(244 63 94 / 0.85)" }
                      : undefined
                  }
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-card px-3 py-1 font-mono text-right tabular-nums select-none",
                      // Trait horaire renforcé sur toute la largeur de la grille
                      // — appliqué directement sur chaque <td> car les cellules
                      // TASK / colonnes sticky ont leur propre fond qui
                      // masquerait un border-t posé sur le <tr>.
                      isHourMark && "border-t-2 border-t-zinc-400/70 dark:border-t-zinc-500/70",
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
                        cellKey={key}
                        empIdx={empIdx}
                        slotIdx={slotIdx}
                        entry={entry}
                        prevEntry={prevEntry}
                        nextEntry={nextEntry}
                        canEdit={canEdit}
                        dndEnabled={dndEnabled}
                        isSelected={isSelected}
                        isOvertime={isOvertime}
                        isPrevOvertime={prevOvertime}
                        isNextOvertime={nextOvertime}
                        isRecent={isRecent}
                        isMyColumn={isMyColumn}
                        isHourMark={isHourMark}
                        onMouseDown={handleCellMouseDown}
                        onMouseEnter={handleCellMouseEnter}
                        onMouseUp={handleCellMouseUp}
                        onCellClickDirect={
                          onCellClick && employees[empIdx]
                            ? () => onCellClick(employees[empIdx].id, date, TIME_SLOTS[slotIdx])
                            : undefined
                        }
                      />
                    );
                  })}
                  <td
                    className={cn(
                      "sticky right-0 z-10 bg-card px-2 py-1 text-center select-none",
                      isHourMark && "border-t-2 border-t-zinc-400/70 dark:border-t-zinc-500/70"
                    )}
                  >
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
                        {breakdownLabel(date, slot, counterStaff, index)}
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

  if (!dndEnabled) return grid;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {grid}
    </DndContext>
  );
});

/* ------------------------------------------------------------------ */
/*                            Cell component                           */
/* ------------------------------------------------------------------ */

const Cell = memo(function Cell({
  cellKey,
  empIdx,
  slotIdx,
  entry,
  prevEntry,
  nextEntry,
  canEdit,
  dndEnabled,
  isSelected,
  isOvertime,
  isPrevOvertime,
  isNextOvertime,
  isRecent,
  isMyColumn,
  isHourMark,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  onCellClickDirect,
}: {
  cellKey: CellKey;
  empIdx: number;
  slotIdx: number;
  entry: ScheduleEntryDTO | null;
  prevEntry: ScheduleEntryDTO | null;
  nextEntry: ScheduleEntryDTO | null;
  canEdit: boolean;
  dndEnabled: boolean;
  isSelected: boolean;
  isOvertime: boolean;
  isPrevOvertime: boolean;
  isNextOvertime: boolean;
  isRecent: boolean;
  isMyColumn: boolean;
  isHourMark: boolean;
  onMouseDown: (e: React.MouseEvent, empIdx: number, slotIdx: number) => void;
  onMouseEnter: (empIdx: number, slotIdx: number) => void;
  onMouseUp: (empIdx: number, slotIdx: number) => void;
  onCellClickDirect?: () => void;
}) {
  // Hooks DnD : toujours appelés (rules of hooks), désactivés si pas pertinent.
  // - draggable : seulement les cellules TASK (on ne déplace pas une absence
  //   ni une cellule vide).
  // - droppable : cellules TASK et vides ; absences refusent le drop pour
  //   protéger les jours de congé/maladie validés.
  const isAbsence = entry?.type === "ABSENCE";
  const isTask = entry?.type === "TASK";

  const draggable = useDraggable({
    id: cellKey,
    disabled: !dndEnabled || !isTask,
  });
  const droppable = useDroppable({
    id: cellKey,
    disabled: !dndEnabled || isAbsence,
  });

  const setNodeRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };

  const isDragging = draggable.isDragging;
  const isOver = droppable.isOver;

  // En mode DnD : sur cellule TASK, on remplace les handlers de sélection
  // rectangulaire par les listeners DnD + un onClick natif (pour ouvrir le
  // TaskSelector si le user a cliqué sans drag — le PointerSensor distingue
  // click vs drag via son activationConstraint distance: 6).
  const taskCellUsesDnd = dndEnabled && isTask;
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
    isRecent && "animate-cell-flash",
    // Trait horaire : appliqué sur chaque cellule pour traverser visuellement
    // toute la largeur de la grille (les fonds des cellules colorées sinon
    // masqueraient un border posé sur le <tr>).
    isHourMark && "border-t-2 border-t-zinc-400/70 dark:border-t-zinc-500/70"
  );

  // Cellules TASK en mode DnD : les listeners de drag remplacent les handlers
  // mouseDown/Enter/Up de la sélection rectangulaire. Sur cellules vides ou
  // ABSENCE, ces handlers sont conservés pour que la sélection rectangulaire
  // continue de fonctionner librement. Les attributs DnD (data-*) sont aussi
  // appliqués pour l'accessibilité clavier.
  const selectionHandlers = canEdit
    ? {
        onMouseDown: (e: React.MouseEvent) => onMouseDown(e, empIdx, slotIdx),
        onMouseEnter: () => onMouseEnter(empIdx, slotIdx),
        onMouseUp: () => onMouseUp(empIdx, slotIdx),
      }
    : {};
  const handlers = taskCellUsesDnd ? {} : selectionHandlers;

  // Wash cream/warm-neutral très subtil — colore toute la colonne du user
  // connecté façon "lane Apple Notes". Quasi imperceptible sur les couleurs
  // de postes mais suffisant pour scanner sa colonne d'un coup d'œil.
  const myColumnWash = "rgba(252, 211, 77, 0.08)"; // amber-300 @ 8%

  // Indicateur visuel quand la cellule est survolée par un drag
  const dropTargetRing =
    isOver && dndEnabled && !isAbsence
      ? "ring-2 ring-violet-500/70 ring-inset"
      : "";

  // Cellule vide — ultra-minimal, juste un hover discret + wash warm doux
  if (!entry) {
    return (
      <td
        ref={setNodeRef}
        {...handlers}
        className={cn(
          baseClasses,
          "border-b border-b-zinc-100/80",
          canEdit && "hover:bg-zinc-50/80",
          isMyColumn && "bg-amber-50/50",
          dropTargetRing
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
    // Listeners DnD si actif sur TASK ; sinon handlers de sélection rect
    const dndProps = taskCellUsesDnd
      ? { ...draggable.listeners, ...draggable.attributes }
      : {};
    return (
      <td
        ref={setNodeRef}
        {...handlers}
        {...dndProps}
        onClick={taskCellUsesDnd ? onCellClickDirect : undefined}
        className={cn(
          baseClasses,
          isLastOfBlock && "border-b border-b-white",
          dropTargetRing,
          isDragging && "opacity-40",
          taskCellUsesDnd && "touch-none"
        )}
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
        ref={setNodeRef}
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
      ref={setNodeRef}
      {...handlers}
      className={cn(baseClasses, isMyColumn && "bg-amber-50/50")}
    />
  );
});
