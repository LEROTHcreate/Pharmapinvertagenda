import { create } from "zustand";
import type { AbsenceCode, TaskCode } from "@prisma/client";
import type { ScheduleEntryDTO } from "@/types";

/**
 * Store Zustand du planning : centralise l'état des cellules (`entries`) et
 * l'historique undo/redo, avec des actions PURES et testables. Extrait de
 * PlanningView pour rendre cette logique critique (transforms optimistes +
 * undo) couverte par des tests — elle ne l'était pas auparavant.
 *
 * L'orchestration réseau (appels API, rollback, dialog de conflit) reste dans
 * PlanningView ; le store ne gère QUE l'état local et l'historique. Avantage
 * clé : `usePlanningStore.getState().entries` est toujours frais → on supprime
 * les `useRef` miroirs (entriesRef) du composant.
 */

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type CellRef = { employeeId: string; date: string; timeSlot: string };

export type CellUpdate = CellRef & {
  type: "TASK" | "ABSENCE";
  taskCode?: string | null;
  absenceCode?: string | null;
};

export type CellSnapshot = CellRef & {
  /** null = la case était vide ; sinon, contenu exact à restaurer. */
  before:
    | { type: "TASK" | "ABSENCE"; taskCode: TaskCode | null; absenceCode: AbsenceCode | null }
    | null;
};

export type UndoAction = {
  /** Court label affiché dans le toast après undo (ex. "modification"). */
  label: string;
  snapshots: CellSnapshot[];
};

const UNDO_HISTORY_MAX = 50;

/* ─── Helpers purs (exportés pour réutilisation + tests) ─────────────────── */

/** Clé canonique d'une cellule (diff optimiste). */
export function entryKey(e: CellRef): string {
  return `${e.employeeId}|${e.date}|${e.timeSlot}`;
}

/**
 * Applique en local (optimistic) un upsert d'entrées. Seules les entrées dont
 * la date appartient à la semaine visible sont reflétées (les autres semaines
 * sont écrites côté serveur mais hors viewport).
 */
export function applyEntriesUpdate(
  prev: ScheduleEntryDTO[],
  updates: CellUpdate[],
  visibleDates: Set<string>
): ScheduleEntryDTO[] {
  const map = new Map<string, ScheduleEntryDTO>();
  prev.forEach((e) => map.set(entryKey(e), e));
  for (const u of updates) {
    if (!visibleDates.has(u.date)) continue;
    const k = entryKey(u);
    const existing = map.get(k);
    map.set(k, {
      id: existing?.id ?? `temp-${k}`,
      employeeId: u.employeeId,
      date: u.date,
      timeSlot: u.timeSlot,
      type: u.type,
      taskCode:
        u.type === "TASK" ? ((u.taskCode ?? null) as TaskCode | null) : null,
      absenceCode:
        u.type === "ABSENCE"
          ? ((u.absenceCode ?? null) as AbsenceCode | null)
          : null,
      notes: existing?.notes ?? null,
    });
  }
  return Array.from(map.values());
}

/** Pendant optimiste : suppression locale d'entrées. */
export function applyEntriesDelete(
  prev: ScheduleEntryDTO[],
  deletes: CellRef[],
  visibleDates: Set<string>
): ScheduleEntryDTO[] {
  const keys = new Set(
    deletes.filter((d) => visibleDates.has(d.date)).map((d) => entryKey(d))
  );
  return prev.filter((e) => !keys.has(entryKey(e)));
}

/** Capture l'état "avant" des cellules ciblées (pour undo). */
export function captureSnapshots(
  entries: ScheduleEntryDTO[],
  cellRefs: CellRef[]
): CellSnapshot[] {
  const seen = new Set<string>();
  const snapshots: CellSnapshot[] = [];
  for (const ref of cellRefs) {
    const k = entryKey(ref);
    if (seen.has(k)) continue;
    seen.add(k);
    const e = entries.find(
      (en) =>
        en.employeeId === ref.employeeId &&
        en.date === ref.date &&
        en.timeSlot === ref.timeSlot
    );
    snapshots.push({
      employeeId: ref.employeeId,
      date: ref.date,
      timeSlot: ref.timeSlot,
      before: e
        ? { type: e.type, taskCode: e.taskCode ?? null, absenceCode: e.absenceCode ?? null }
        : null,
    });
  }
  return snapshots;
}

/* ─── Store ──────────────────────────────────────────────────────────────── */

type PlanningState = {
  entries: ScheduleEntryDTO[];
  undoStack: UndoAction[];
  redoStack: UndoAction[];

  /** Remplace les entrées et VIDE l'historique (changement de semaine). */
  resetForWeek: (entries: ScheduleEntryDTO[]) => void;
  /** Remplace les entrées sans toucher l'historique (rollback, refetch). */
  setEntries: (entries: ScheduleEntryDTO[]) => void;

  /** Upsert optimiste. */
  applyUpdate: (updates: CellUpdate[], visibleDates: Set<string>) => void;
  /** Suppression optimiste. */
  applyDelete: (deletes: CellRef[], visibleDates: Set<string>) => void;

  /** Empile une action annulable (capture l'état "avant" + vide le redo). */
  pushUndo: (label: string, cellRefs: CellRef[]) => void;

  /**
   * Prépare un undo : dépile l'action du sommet, empile sa contrepartie dans
   * redo (état courant), et renvoie l'action à rejouer (ou null si vide).
   * L'appelant applique ensuite les snapshots (optimiste + API).
   */
  popUndo: () => UndoAction | null;
  /** Symétrique de popUndo pour le redo. */
  popRedo: () => UndoAction | null;
};

export const usePlanningStore = create<PlanningState>((set, get) => ({
  entries: [],
  undoStack: [],
  redoStack: [],

  resetForWeek: (entries) => set({ entries, undoStack: [], redoStack: [] }),
  setEntries: (entries) => set({ entries }),

  applyUpdate: (updates, visibleDates) =>
    set((s) => ({ entries: applyEntriesUpdate(s.entries, updates, visibleDates) })),
  applyDelete: (deletes, visibleDates) =>
    set((s) => ({ entries: applyEntriesDelete(s.entries, deletes, visibleDates) })),

  pushUndo: (label, cellRefs) => {
    if (cellRefs.length === 0) return;
    const snapshots = captureSnapshots(get().entries, cellRefs);
    set((s) => ({
      undoStack: [...s.undoStack.slice(-(UNDO_HISTORY_MAX - 1)), { label, snapshots }],
      redoStack: [],
    }));
  },

  popUndo: () => {
    const { undoStack, entries } = get();
    if (undoStack.length === 0) return null;
    const action = undoStack[undoStack.length - 1];
    // Contrepartie pour le redo : état courant des mêmes cellules.
    const redoAction: UndoAction = {
      label: action.label,
      snapshots: captureSnapshots(entries, action.snapshots),
    };
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack.slice(-(UNDO_HISTORY_MAX - 1)), redoAction],
    }));
    return action;
  },

  popRedo: () => {
    const { redoStack, entries } = get();
    if (redoStack.length === 0) return null;
    const action = redoStack[redoStack.length - 1];
    const undoAction: UndoAction = {
      label: action.label,
      snapshots: captureSnapshots(entries, action.snapshots),
    };
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack.slice(-(UNDO_HISTORY_MAX - 1)), undoAction],
    }));
    return action;
  },
}));
