"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  MouseSensor,
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
import {
  makeCellKey,
  parseCellKey,
  type CellKey,
  type ParsedCell,
} from "@/lib/cell-keys";

// Clés de cellule centralisées dans lib/cell-keys — re-exportées ici pour
// compat avec les importateurs existants (TemplateView, PlanningView).
export { makeCellKey };
export type { CellKey, ParsedCell };

/** Préfixe d'ID pour les drags de colonne (réordonnancement des collaborateurs).
 *  Évite toute collision avec les CellKey (qui contiennent des `|`). */
const COL_ID_PREFIX = "col:";
function colId(employeeId: string): string {
  return `${COL_ID_PREFIX}${employeeId}`;
}
function isColId(id: string | number): boolean {
  return typeof id === "string" && id.startsWith(COL_ID_PREFIX);
}
function colIdToEmployeeId(id: string): string {
  return id.slice(COL_ID_PREFIX.length);
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
  /**
   * Variante "bloc" : quand l'utilisateur long-press une cellule TASK qui
   * fait partie d'un bloc continu (même taskCode, créneaux adjacents),
   * tout le bloc est déplacé ensemble. Le parent reçoit la liste complète
   * des cellules du bloc + la source long-pressée + la cible drop.
   */
  onMoveBlock?: (
    block: ParsedCell[],
    source: ParsedCell,
    target: ParsedCell
  ) => void;
  /**
   * Réordonnancement des colonnes (admin desktop). Si fourni, une poignée
   * de drag apparaît au hover de chaque en-tête. Le parent reçoit la
   * nouvelle liste d'ids dans l'ordre voulu et fait l'optimistic update +
   * appel API.
   */
  onReorderColumns?: (orderedIds: string[]) => void;
  /** Densité d'affichage desktop : "compact" (défaut) ou "comfortable". */
  density?: "compact" | "comfortable";
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
  onMoveBlock,
  onReorderColumns,
  density = "compact",
}: Props) {
  const dndEnabled = canEdit && !!onMoveTask;
  // Réordonnancement de colonnes : desktop uniquement (sur tactile, l'écran
  // est trop étroit et le long-press est déjà pris par le déplacement de
  // tâche). Activé seulement si le parent fournit un handler.
  const colReorderEnabled = canEdit && !!onReorderColumns;

  // Détection device tactile : `(pointer: coarse)` couvre téléphone + tablette.
  // SSR-safe (le matchMedia n'existe que côté client).
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Suivi de la touche modificatrice de DnD (Ctrl sur Win/Linux, Cmd sur
  // Mac) : activation du DnD souris uniquement quand la touche est tenue
  // → préserve la sélection rectangulaire 30min×30min comme gesture par
  // défaut.
  // On surveille sur 3 sources pour fiabiliser la détection :
  //   - keydown/keyup (Control / Meta)
  //   - tout event clavier (e.ctrlKey / e.metaKey) — couvre les combos
  //     genre Ctrl+Tab où la touche Control elle-même peut ne pas générer
  //     un keydown standard
  //   - tout mousemove (e.ctrlKey / e.metaKey) — couvre le cas où
  //     l'utilisateur tient Ctrl avant que la fenêtre ait reçu le focus
  const [isModHeld, setIsModHeld] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // PERF : on suit Ctrl/Cmd via keydown/keyup UNIQUEMENT. L'ancienne version
    // écoutait aussi `mousemove`/`mousedown` → `setIsModHeld` était appelé à
    // chaque pixel de déplacement souris, et le moindre changement de
    // `isModHeld` re-render toutes les ~700 cellules de la grille (chacune
    // ré-exécutant les hooks dnd-kit). keydown/keyup suffisent ; le cas
    // marginal « Ctrl tenu avant que la fenêtre ait le focus » n'en vaut pas
    // le coût.
    const sync = (e: KeyboardEvent) => setIsModHeld(e.ctrlKey || e.metaKey);
    const onBlur = () => setIsModHeld(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Sensors :
  //   - TouchSensor : long-press 350ms (mobile/tablette)
  //   - MouseSensor : drag direct dès 6px (desktop) — mais SEULEMENT activé
  //     sur les cellules TASK quand Ctrl/Cmd est tenu (cf. `taskCellUsesDnd`
  //     plus bas).
  // L'activation conditionnelle se fait au niveau du Cell (attache des
  // listeners DnD seulement quand le modifier est tenu sur souris).
  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 350, tolerance: 8 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // PERF (grille) : le drag & drop des cellules n'est utile que sur tactile
  // (long-press) ou sur souris avec Ctrl/Cmd tenu. Le reste du temps (usage
  // desktop courant : édition, navigation, sélection), on rend des cellules
  // SANS aucun hook dnd-kit → la grille ne paie plus le coût de ~700 hooks
  // re-exécutés à chaque render. On ne bascule sur la variante DnD (avec hooks)
  // que quand elle peut réellement servir. La réorganisation des colonnes
  // (en-têtes) garde son propre DnD, indépendant.
  const CellComponent =
    dndEnabled && (isTouchDevice || isModHeld) ? DndCell : PlainCell;

  // ─── Block detection : trouve les cellules TASK adjacentes même code ─
  // Walk back/forward depuis la cellule source jusqu'à rencontrer une
  // cellule différente (autre taskCode, absence, ou vide).
  const computeBlock = useCallback(
    (start: ParsedCell): ParsedCell[] => {
      const dayMap = index.get(start.employeeId)?.get(start.date);
      if (!dayMap) return [start];
      const startEntry = dayMap.get(start.timeSlot);
      if (
        !startEntry ||
        startEntry.type !== ScheduleType.TASK ||
        !startEntry.taskCode
      ) {
        return [start];
      }
      const startIdx = TIME_SLOTS.indexOf(start.timeSlot);
      if (startIdx < 0) return [start];

      const block: ParsedCell[] = [start];

      // Remonter
      for (let i = startIdx - 1; i >= 0; i--) {
        const slot = TIME_SLOTS[i];
        const e = dayMap.get(slot);
        if (
          e?.type === ScheduleType.TASK &&
          e.taskCode === startEntry.taskCode
        ) {
          block.unshift({ ...start, timeSlot: slot });
        } else break;
      }

      // Descendre
      for (let j = startIdx + 1; j < TIME_SLOTS.length; j++) {
        const slot = TIME_SLOTS[j];
        const e = dayMap.get(slot);
        if (
          e?.type === ScheduleType.TASK &&
          e.taskCode === startEntry.taskCode
        ) {
          block.push({ ...start, timeSlot: slot });
        } else break;
      }
      return block;
    },
    [index]
  );

  // État du bloc actuellement "saisi" (pendant un drag tactile). Utilisé
  // pour afficher un ring sur toutes les cellules du bloc → l'utilisateur
  // voit immédiatement l'étendue de ce qu'il déplace.
  const [activeBlockKeys, setActiveBlockKeys] = useState<Set<CellKey> | null>(
    null
  );

  // ID de la colonne actuellement draggée — sert à styler la source en
  // transparence et à mettre la cible en surbrillance pendant le réordon.
  const [draggingColId, setDraggingColId] = useState<string | null>(null);

  // Feedback haptique léger (15ms) + détection du bloc au démarrage du drag.
  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate?.(15);
        } catch {
          /* ignored */
        }
      }
      // Drag de colonne → on retient l'id pour styler la source ; pas de bloc.
      if (isColId(event.active.id)) {
        setDraggingColId(colIdToEmployeeId(event.active.id as string));
        return;
      }
      const source = parseCellKey(event.active.id as string);
      const block = computeBlock(source);
      // On ne montre l'effet bloc que si > 1 cellule (sinon c'est un drag
      // de cellule simple, pas la peine d'afficher un état spécial).
      if (block.length > 1) {
        setActiveBlockKeys(
          new Set(block.map((c) => makeCellKey(c.employeeId, c.date, c.timeSlot)))
        );
      }
    },
    [computeBlock]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveBlockKeys(null);
      setDraggingColId(null);
      const { active, over } = event;
      if (!over || !active) return;
      if (active.id === over.id) return;

      // ── Drag de colonne (réordonnancement des collaborateurs) ───────
      if (isColId(active.id) && isColId(over.id) && onReorderColumns) {
        const sourceEmpId = colIdToEmployeeId(active.id as string);
        const targetEmpId = colIdToEmployeeId(over.id as string);
        const fromIdx = employees.findIndex((e) => e.id === sourceEmpId);
        const toIdx = employees.findIndex((e) => e.id === targetEmpId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
        const next = employees.slice();
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        onReorderColumns(next.map((e) => e.id));
        return;
      }
      // Mix col/cell : on ignore (un drag colonne sur une cellule, ou
      // l'inverse, n'a pas de sens métier).
      if (isColId(active.id) || isColId(over.id)) return;

      const source = parseCellKey(active.id as string);
      const target = parseCellKey(over.id as string);
      const block = computeBlock(source);
      // Si le bloc fait plus d'1 cellule ET qu'on a un handler bloc → bloc.
      // Sinon → drag cellule simple.
      if (block.length > 1 && onMoveBlock) {
        onMoveBlock(block, source, target);
      } else if (onMoveTask) {
        onMoveTask(source, target);
      }
    },
    [computeBlock, onMoveTask, onMoveBlock, onReorderColumns, employees]
  );

  // Si l'utilisateur annule (esc ou drop hors zone), nettoie le state.
  const handleDragCancel = useCallback(() => {
    setActiveBlockKeys(null);
    setDraggingColId(null);
  }, []);
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
      // Shift seul = additive (étendre la sélection). Ctrl/Cmd est
      // réservé au DnD (cf. isModHeld plus haut) : on ne les met pas ici
      // pour éviter que Ctrl+drag déclenche aussi une rect-select.
      const additive = e.shiftKey;
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

  // Handler STABLE pour le clic direct sur une cellule TASK en mode DnD
  // (souris Ctrl/Cmd ou tactile). Évitait d'allouer une closure PAR cellule à
  // chaque render — ce qui cassait le memo() des ~700 cellules et re-rendait
  // toute la grille à la moindre interaction.
  const onCellClickAt = useCallback(
    (empIdx: number, slotIdx: number) => {
      if (onCellClick && employees[empIdx]) {
        onCellClick(employees[empIdx].id, date, TIME_SLOTS[slotIdx]);
      }
    },
    [onCellClick, employees, date]
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

  // Largeur minimum garantie par colonne employé.
  // Mobile (<640px) : 48px/colonne — compact, scrollable.
  // Tablette+ : 72px/colonne — confort tactile + lisibilité.
  // Le calcul se fait en CSS pour s'adapter sans JS au resize.

  const grid = (
    <div className="select-none rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin overscroll-x-contain">
        <table
          data-density={density}
          aria-label="Grille de planning de l'équipe"
          // Variables CSS responsive : largeur de colonne employé + colonne
          // heure + colonne effectif. Sur mobile on réduit fortement pour
          // tenir tout le planning dans la largeur d'écran (vue d'ensemble),
          // au prix de la lisibilité des labels dans les cellules.
          className={cn(
            "w-full border-collapse text-[10.5px] sm:text-[12px]",
            // Largeurs colonnes adaptatives par breakpoint, calibrées pour
            // que 17 collaborateurs tiennent sur l'écran sans scroll H :
            //   mobile (<640px)  : 28px — vue compacte (scroll H accepté)
            //   sm (640-767px)   : 42px — vue tablette confortable
            //   md (768-1023px)  : sidebar visible 256px → 36px par col
            //   lg (1024-1279px) : sidebar 256 → ~38px par col (laptop 1024)
            //   xl (1280-1535px) : sidebar 256 → ~50px par col (laptop 1280+)
            //   2xl (≥1536px)    : sidebar 256 → ~64px par col (Full HD+)
            "[--col-w:28px] [--time-w:36px] [--eff-w:28px]",
            "sm:[--col-w:42px] sm:[--time-w:44px] sm:[--eff-w:36px]",
            "md:[--col-w:32px] md:[--time-w:38px] md:[--eff-w:30px]",
            "lg:[--col-w:40px] lg:[--time-w:44px] lg:[--eff-w:34px]",
            "xl:[--col-w:50px] xl:[--time-w:48px] xl:[--eff-w:40px]",
            "2xl:[--col-w:64px] 2xl:[--time-w:52px] 2xl:[--eff-w:44px]"
          )}
          style={{
            tableLayout: "fixed",
            minWidth: `calc(${employees.length} * var(--col-w) + var(--time-w) + var(--eff-w))`,
          }}
        >
          <colgroup>
            <col style={{ width: "var(--time-w)" }} />
            {employees.map((emp) => (
              <col key={emp.id} />
            ))}
            <col style={{ width: "var(--eff-w)" }} />
          </colgroup>
          <thead>
            {/* Ligne unique : nom · statut · contrat · jour · semaine */}
            {/* Sur mobile : fond plein (perf + lisibilité). Sur desktop :
                léger blur sous l'en-tête sticky pour effet "frosted glass". */}
            <tr className="bg-card">
              <th className="sticky left-0 z-20 bg-card px-3 py-3 text-left w-16 min-w-16 align-bottom">
                <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground/70">
                  Heure
                </span>
              </th>
              {employees.map((e) => {
                const h = headerHours.get(e.id);
                const dailyH = h?.dailyH ?? 0;
                const weeklyH = h?.weeklyH ?? 0;
                const delta = weeklyH - e.weeklyHours;
                const isMe = !!currentEmployeeId && e.id === currentEmployeeId;
                const weekStartDate = weekDates[0] ?? "";

                return (
                  <HeaderCell
                    key={e.id}
                    employee={e}
                    dailyH={dailyH}
                    weeklyH={weeklyH}
                    delta={delta}
                    isMe={isMe}
                    weekStartDate={weekStartDate}
                    colReorderEnabled={colReorderEnabled}
                    isDragging={draggingColId === e.id}
                  />
                );
              })}
              <th className="sticky right-0 z-20 bg-card px-3 py-3 w-12 min-w-12 align-bottom">
                <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground/70">
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
              // Zebra : alternance demi-heure → fond blanc / fond gris léger.
              // Une cellule TASK / ABSENCE pose son propre fond par-dessus,
              // donc seules les cases vides montrent l'alternance.
              // Zebra plus marqué : blanc franc ↔ gris nettement visible, pour
              // qu'on distingue les demi-heures d'un coup d'œil (retour user).
              const zebraClass = slotIdx % 2 === 0
                ? "[&>td:not(.has-content)]:bg-card dark:[&>td:not(.has-content)]:bg-zinc-900"
                : "[&>td:not(.has-content)]:bg-zinc-200/70 dark:[&>td:not(.has-content)]:bg-zinc-800";
              return (
                <tr
                  key={slot}
                  className={cn(
                    "group/row transition-colors",
                    zebraClass
                    // Ligne "heure actuelle" : dessinée par cellule via
                    // box-shadow inset (cf. CURRENT_TIME_LINE), et non par une
                    // bordure sur le <tr> — pour rester continue au-dessus des
                    // colonnes sticky. Voir le prop `isCurrentRow` passé aux <td>.
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-card px-3 py-1 font-mono text-right tabular-nums select-none",
                      // Trait horaire renforcé — masqué quand c'est le créneau
                      // courant pour laisser la place au trait rouge.
                      isHourMark && !isCurrent && "border-t-2 border-t-zinc-400/70 dark:border-t-zinc-500/70",
                      isHourMark
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground/40 text-[10.5px]",
                      isCurrent && "text-rose-600 font-semibold"
                    )}
                    style={isCurrent ? { boxShadow: CURRENT_TIME_LINE } : undefined}
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
                    // Toute la colonne se "soulève" pendant un drag de réordonnancement
                    const isInDragSourceCol = !!draggingColId && draggingColId === emp.id;
                    return (
                      <CellComponent
                        key={emp.id}
                        cellKey={key}
                        isCurrentRow={isCurrent}
                        empIdx={empIdx}
                        slotIdx={slotIdx}
                        entry={entry}
                        prevEntry={prevEntry}
                        nextEntry={nextEntry}
                        canEdit={canEdit}
                        dndEnabled={dndEnabled}
                        isTouchDevice={isTouchDevice}
                        isModHeld={isModHeld}
                        isInActiveBlock={activeBlockKeys?.has(key) ?? false}
                        isSelected={isSelected}
                        isOvertime={isOvertime}
                        isPrevOvertime={prevOvertime}
                        isNextOvertime={nextOvertime}
                        isRecent={isRecent}
                        isMyColumn={isMyColumn}
                        isInDragSourceCol={isInDragSourceCol}
                        onMouseDown={handleCellMouseDown}
                        onMouseEnter={handleCellMouseEnter}
                        onMouseUp={handleCellMouseUp}
                        onCellClickAt={onCellClickAt}
                      />
                    );
                  })}
                  <td
                    className={cn(
                      "sticky right-0 z-10 bg-card px-2 py-1 text-center select-none",
                      isHourMark && !isCurrent && "border-t-2 border-t-zinc-400/70 dark:border-t-zinc-500/70"
                    )}
                    style={isCurrent ? { boxShadow: CURRENT_TIME_LINE } : undefined}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            "inline-flex items-center justify-center rounded-full font-semibold tabular-nums cursor-help transition-all",
                            // OK (≥ seuil) : discret pour ne pas surcharger
                            // l'œil quand tout va bien.
                            level === "ok" &&
                              "min-w-[22px] h-5 px-1.5 text-[10.5px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                            // WARNING (2-3 si min=4) : badge plein ambre +
                            // texte blanc + ring → visible d'un coup d'œil.
                            level === "warning" &&
                              "min-w-[24px] h-[22px] px-1.5 text-[11px] bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-900/50 shadow-sm",
                            // CRITICAL avec staff > 0 : rouge saturé.
                            // CRITICAL avec staff === 0 : rouge sombre +
                            // pulse → flash quand personne au comptoir.
                            level === "critical" &&
                              staff > 0 &&
                              "min-w-[24px] h-[22px] px-1.5 text-[11px] bg-rose-500 text-white ring-2 ring-rose-200 dark:ring-rose-900/50 shadow-sm",
                            level === "critical" &&
                              staff === 0 &&
                              "min-w-[24px] h-[22px] px-1.5 text-[11px] bg-red-600 text-white ring-2 ring-red-300 dark:ring-red-900/60 shadow-md animate-pulse"
                          )}
                          aria-label={
                            staff === 0
                              ? "Aucun pharmacien/préparateur ce créneau"
                              : `${staff} au comptoir`
                          }
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

  // DndContext nécessaire dès que l'une des deux DnD est active : drag de
  // cellule (déplacement de tâche) OU drag de colonne (réordonnancement).
  if (!dndEnabled && !colReorderEnabled) return grid;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {grid}
    </DndContext>
  );
});

/* ------------------------------------------------------------------ */
/*                            Cell component                           */
/* ------------------------------------------------------------------ */

// Ligne "heure actuelle" : dessinée via box-shadow inset (et non un
// border-top). En border-collapse, un border-top posé sur les <td> est masqué
// sur les colonnes sticky (heure / effectif) qui repeignent leur fond
// par-dessus → ligne rouge coupée aux extrémités. Le box-shadow inset, lui,
// se peint AU-DESSUS du fond de chaque cellule (colorée ou sticky) → ligne
// continue et nette sur toute la largeur.
const CURRENT_TIME_LINE = "inset 0 3px 0 0 rgb(244 63 94)"; // rose-500

/** Props communs à toutes les variantes de cellule (présentation + sélection). */
type CellProps = {
  cellKey: CellKey;
  /** True si cette cellule est sur la ligne "heure actuelle" → trait rouge. */
  isCurrentRow: boolean;
  empIdx: number;
  slotIdx: number;
  entry: ScheduleEntryDTO | null;
  prevEntry: ScheduleEntryDTO | null;
  nextEntry: ScheduleEntryDTO | null;
  canEdit: boolean;
  dndEnabled: boolean;
  isTouchDevice: boolean;
  isModHeld: boolean;
  isInActiveBlock: boolean;
  isSelected: boolean;
  isOvertime: boolean;
  isPrevOvertime: boolean;
  isNextOvertime: boolean;
  isRecent: boolean;
  isMyColumn: boolean;
  /** True quand cette cellule appartient à la colonne en cours de drag de
   *  réordonnancement → on baisse l'opacité pour signaler "tout ce bloc bouge". */
  isInDragSourceCol: boolean;
  onMouseDown: (e: React.MouseEvent, empIdx: number, slotIdx: number) => void;
  onMouseEnter: (empIdx: number, slotIdx: number) => void;
  onMouseUp: (empIdx: number, slotIdx: number) => void;
  onCellClickAt?: (empIdx: number, slotIdx: number) => void;
};

/**
 * Bits dérivés du drag & drop, résolus par la variante appelante :
 *  - `PlainCell` (défaut desktop hors Ctrl) → valeurs neutres, AUCUN hook.
 *  - `DndCell`   (tactile ou Ctrl/Cmd tenu) → issus de useDraggable/useDroppable.
 */
type CellDnd = {
  setNodeRef?: (node: HTMLElement | null) => void;
  dndProps: Record<string, unknown>;
  isDragging: boolean;
  isOver: boolean;
  taskCellUsesDnd: boolean;
};

const EMPTY_DND: CellDnd = {
  setNodeRef: undefined,
  dndProps: {},
  isDragging: false,
  isOver: false,
  taskCellUsesDnd: false,
};

/**
 * Rendu PUR d'une cellule (aucun hook dnd-kit). Reçoit les bits de drag & drop
 * déjà résolus. Factorisé pour que PlainCell et DndCell partagent EXACTEMENT le
 * même markup — seule diffère la présence des hooks dnd-kit (cf. plus bas).
 */
function CellView({
  isCurrentRow,
  empIdx,
  slotIdx,
  entry,
  prevEntry,
  nextEntry,
  canEdit,
  dndEnabled,
  isTouchDevice,
  isModHeld,
  isInActiveBlock,
  isSelected,
  isOvertime,
  isPrevOvertime,
  isNextOvertime,
  isRecent,
  isMyColumn,
  isInDragSourceCol,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  onCellClickAt,
  setNodeRef,
  dndProps,
  isDragging,
  isOver,
  taskCellUsesDnd,
}: CellProps & CellDnd) {
  const isAbsence = entry?.type === "ABSENCE";
  const isTask = entry?.type === "TASK";

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
    // Toute la colonne en cours de réordonnancement → semi-transparente,
    // pour que l'admin voie clairement quel bloc complet est en train d'être déplacé.
    isInDragSourceCol && "opacity-40",
    canEdit && "cursor-pointer",
    // Quand Ctrl/Cmd est tenu sur souris + cellule TASK draggable, on change
    // le curseur en "grab" pour indiquer "tu peux déplacer le bloc".
    canEdit && isTask && isModHeld && !isTouchDevice && "cursor-grab",
    isSelected && "ring-2 ring-violet-500/80 ring-inset z-[5]",
    isRecent && "animate-cell-flash",
    // Effet "bloc en cours de drag" : ring violet pulsé + scale léger
    // pour signaler que la cellule fait partie du bloc déplacé.
    isInActiveBlock && "ring-2 ring-violet-500 ring-inset z-[10] animate-pulse"
    // Trait horaire ajouté UNIQUEMENT sur les cellules vides — sur les
    // cellules TASK / ABSENCE le bloc coloré reste continu et propre.
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

  // Cellule vide — ultra-minimal, juste un hover discret + wash warm doux.
  // Pas de trait horaire ici : le repère se fait via la colonne "Heure"
  // à gauche + l'alternance zebra blanc/gris sur les demi-heures vides.
  // Avec border-collapse, mettre un border-top sur les cellules vides
  // crée une ligne perçue comme traversant les blocs colorés voisins.
  if (!entry) {
    return (
      <td
        ref={setNodeRef}
        {...handlers}
        className={cn(
          baseClasses,
          "border-b border-b-zinc-100/80",
          canEdit && "hover:bg-muted/40",
          isMyColumn && "bg-amber-50/50",
          dropTargetRing
        )}
        style={isCurrentRow ? { boxShadow: CURRENT_TIME_LINE } : undefined}
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
    // `dndProps` (listeners + attributes du draggable) est fourni par la
    // variante DnD ; vide en PlainCell.
    return (
      <td
        ref={setNodeRef}
        {...handlers}
        {...dndProps}
        onClick={taskCellUsesDnd ? () => onCellClickAt?.(empIdx, slotIdx) : undefined}
        className={cn(
          baseClasses,
          "has-content",
          isLastOfBlock && "border-b border-b-white",
          dropTargetRing,
          isDragging && "opacity-40",
          taskCellUsesDnd && "touch-none"
        )}
        style={{
          background,
          color: c.text,
          // Trait "heure actuelle" combiné au cadre heures-sup s'il y en a un.
          boxShadow:
            [overtimeBorders, isCurrentRow && CURRENT_TIME_LINE]
              .filter(Boolean)
              .join(", ") || undefined,
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
        className={cn(baseClasses, "has-content", isLastOfBlock && "border-b border-b-white")}
        style={{
          backgroundColor: s.bg,
          backgroundImage: layers.join(", "),
          color: s.text,
          boxShadow: isCurrentRow ? CURRENT_TIME_LINE : undefined,
        }}
        title={`Absence ${entry.absenceCode}`}
      >
        {!isContinuation && (
          <span className="text-[10.5px] font-bold tracking-[0.04em] uppercase">
            {ABSENCE_ICONS[entry.absenceCode]}
          </span>
        )}
      </td>
    );
  }

  return (
    <td
      ref={setNodeRef}
      {...handlers}
      className={cn(baseClasses, isMyColumn && "bg-amber-50/50")}
      style={isCurrentRow ? { boxShadow: CURRENT_TIME_LINE } : undefined}
    />
  );
}

/**
 * Variante SANS drag & drop — le cas par défaut sur desktop (hors Ctrl/Cmd).
 *
 * PERF : c'est LE gain clé. Auparavant chaque cellule montait toujours
 * `useDraggable` + `useDroppable` (~700 hooks re-exécutés à chaque édition /
 * navigation / sélection → grille qui rame). Ici aucun hook dnd-kit n'est
 * monté : la grille ne paie le coût du drag & drop QUE lorsqu'il peut
 * réellement servir (tactile, ou Ctrl/Cmd tenu → DndCell).
 */
const PlainCell = memo(function PlainCell(props: CellProps) {
  return <CellView {...props} {...EMPTY_DND} />;
});

/**
 * Variante AVEC drag & drop (hooks dnd-kit). Montée uniquement quand le drag
 * peut servir : tactile (long-press) ou souris + Ctrl/Cmd tenu.
 */
const DndCell = memo(function DndCell(props: CellProps) {
  const isAbsence = props.entry?.type === "ABSENCE";
  const isTask = props.entry?.type === "TASK";

  // - draggable : seulement les cellules TASK (on ne déplace ni une absence ni
  //   une cellule vide).
  // - droppable : cellules TASK et vides ; les absences refusent le drop pour
  //   protéger les jours de congé/maladie validés.
  const draggable = useDraggable({
    id: props.cellKey,
    disabled: !props.dndEnabled || !isTask,
  });
  const droppable = useDroppable({
    id: props.cellKey,
    disabled: !props.dndEnabled || isAbsence,
  });

  const setNodeRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };

  // DnD réellement actif sur cette cellule TASK : tactile OU Ctrl/Cmd tenu.
  const taskCellUsesDnd =
    props.dndEnabled && isTask && (props.isTouchDevice || props.isModHeld);
  const dndProps = taskCellUsesDnd
    ? { ...draggable.listeners, ...draggable.attributes }
    : {};

  return (
    <CellView
      {...props}
      setNodeRef={setNodeRef}
      dndProps={dndProps}
      isDragging={draggable.isDragging}
      isOver={droppable.isOver}
      taskCellUsesDnd={taskCellUsesDnd}
    />
  );
});

/* ------------------------------------------------------------------ */
/*                          HeaderCell component                       */
/* ------------------------------------------------------------------ */

/**
 * En-tête de colonne (un par collaborateur). Affiche prénom, statut, heures.
 * Quand `colReorderEnabled` est vrai, une poignée de drag (GripVertical)
 * apparaît au hover en haut à gauche de la cellule — l'admin peut alors
 * traîner la colonne sur une autre pour réordonner.
 *
 * Le drag n'est attaché QU'à la poignée (et pas au <th> entier) pour ne
 * pas casser le clic du <Link> qui mène à la fiche planning du collaborateur.
 * Le <th> entier est en revanche droppable, pour qu'on puisse lâcher
 * n'importe où sur la colonne cible (UX plus tolérante).
 */
const HeaderCell = memo(function HeaderCell({
  employee,
  dailyH,
  weeklyH,
  delta,
  isMe,
  weekStartDate,
  colReorderEnabled,
  isDragging,
}: {
  employee: EmployeeDTO;
  dailyH: number;
  weeklyH: number;
  delta: number;
  isMe: boolean;
  weekStartDate: string;
  colReorderEnabled: boolean;
  isDragging: boolean;
}) {
  const draggable = useDraggable({
    id: colId(employee.id),
    disabled: !colReorderEnabled,
  });
  const droppable = useDroppable({
    id: colId(employee.id),
    disabled: !colReorderEnabled,
  });

  const setNodeRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };

  // Surbrillance quand une autre colonne survole celle-ci → indication
  // visuelle "tu vas insérer ici". On masque l'indicateur si c'est la
  // colonne en cours de drag elle-même (sinon ring redondant).
  const isDropTarget = droppable.isOver && !isDragging;

  return (
    <th
      ref={setNodeRef}
      className={cn(
        "px-1 pt-2.5 pb-2 align-top overflow-hidden relative group/col transition-all",
        // Lane "ma colonne" — cream warm très subtil, façon Apple Notes
        isMe &&
          "bg-gradient-to-b from-amber-50/70 via-amber-50/40 to-transparent",
        // Source en cours de drag → semi-transparente
        isDragging && "opacity-40",
        // Cible survolée → rail violet à gauche pour signaler l'insertion
        isDropTarget && "ring-2 ring-violet-500/70 ring-inset bg-violet-50/60"
      )}
      title={`${employee.firstName} ${employee.lastName} · ${STATUS_LABELS[employee.status]} · contrat ${employee.weeklyHours}h · jour ${dailyH.toFixed(1)}h · semaine ${weeklyH.toFixed(1)}h${
        Math.abs(delta) >= 0.5 ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(1)}h)` : ""
      }${colReorderEnabled ? " — Glisser la poignée pour réordonner" : " — Cliquer pour voir son planning"}`}
    >
      {/* Poignée de drag — visible uniquement au hover, et seulement si
          le réordonnancement est activé. Position absolute pour ne pas
          repousser le contenu du header. */}
      {colReorderEnabled && (
        <button
          type="button"
          ref={draggable.setActivatorNodeRef}
          {...draggable.listeners}
          {...draggable.attributes}
          aria-label={`Réordonner ${employee.firstName}`}
          className={cn(
            "absolute top-1 left-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/50",
            "opacity-0 group-hover/col:opacity-100 transition-opacity",
            "hover:bg-violet-100 hover:text-violet-700",
            "cursor-grab active:cursor-grabbing",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          )}
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}

      {/* Lien vers la fiche planning du collaborateur */}
      <Link
        href={`/planning/collaborateur/${employee.id}?view=week&week=${weekStartDate}`}
        className="flex flex-col items-stretch gap-0.5 min-w-0 rounded-md px-1 -mx-1 py-1 -my-1 hover:bg-muted/40 transition-colors cursor-pointer"
        // Pendant un drag de colonne, on évite que le clic Link ne se
        // déclenche par accident à la fin du drag (si l'utilisateur
        // relâche au point de départ par exemple).
        draggable={false}
      >
        {/* Nom + pastille couleur */}
        <div className="flex items-center gap-1 justify-center min-w-0">
          <span
            aria-hidden
            className={cn(
              "rounded-full shrink-0",
              isMe ? "h-2 w-2 ring-2 ring-white" : "h-1.5 w-1.5"
            )}
            style={{ background: employee.displayColor }}
          />
          <span className="truncate text-[12px] tracking-tight text-foreground font-semibold">
            {employee.firstName}
          </span>
        </div>
        {/* Statut */}
        <span className="text-[9px] uppercase tracking-[0.04em] text-muted-foreground/70 font-medium text-center truncate">
          {STATUS_LABELS[employee.status]}
        </span>
        {/* Heures faites cette semaine — un seul chiffre, coloré :
            noir = pile le contrat · rouge = au-dessus · vert = en dessous.
            (Le détail jour + écart reste dans l'infobulle au survol.) */}
        <div className="mt-0.5 flex items-center justify-center font-mono text-[11px] font-semibold tabular-nums">
          <span
            className={cn(
              Math.abs(delta) < 0.5
                ? "text-foreground"
                : delta > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {weeklyH.toFixed(1)}
          </span>
        </div>
      </Link>
    </th>
  );
});
