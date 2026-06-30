import { beforeEach, describe, expect, it } from "vitest";
import {
  applyEntriesDelete,
  applyEntriesUpdate,
  captureSnapshots,
  entryKey,
  usePlanningStore,
  type CellUpdate,
} from "./planning-store";
import type { ScheduleEntryDTO } from "@/types";

const VISIBLE = new Set(["2026-06-29", "2026-06-30"]);

function task(
  employeeId: string,
  date: string,
  timeSlot: string,
  taskCode = "COMPTOIR",
  id = `${employeeId}-${date}-${timeSlot}`
): ScheduleEntryDTO {
  return {
    id,
    employeeId,
    date,
    timeSlot,
    type: "TASK",
    taskCode: taskCode as ScheduleEntryDTO["taskCode"],
    absenceCode: null,
    notes: null,
  };
}

describe("entryKey", () => {
  it("clé canonique employeeId|date|timeSlot", () => {
    expect(entryKey({ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" })).toBe(
      "e1|2026-06-29|08:30"
    );
  });
});

describe("applyEntriesUpdate", () => {
  it("ignore les dates hors semaine visible", () => {
    const prev: ScheduleEntryDTO[] = [];
    const updates: CellUpdate[] = [
      { employeeId: "e1", date: "2099-01-01", timeSlot: "08:30", type: "TASK", taskCode: "COMPTOIR" },
    ];
    expect(applyEntriesUpdate(prev, updates, VISIBLE)).toEqual([]);
  });

  it("crée une nouvelle entrée avec un id temporaire", () => {
    const out = applyEntriesUpdate(
      [],
      [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30", type: "TASK", taskCode: "COMPTOIR" }],
      VISIBLE
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("temp-e1|2026-06-29|08:30");
    expect(out[0].taskCode).toBe("COMPTOIR");
    expect(out[0].absenceCode).toBeNull();
  });

  it("préserve l'id et les notes d'une entrée existante mise à jour", () => {
    const prev = [{ ...task("e1", "2026-06-29", "08:30"), id: "real-id", notes: "garde" }];
    const out = applyEntriesUpdate(
      prev,
      [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30", type: "TASK", taskCode: "PARAPHARMACIE" }],
      VISIBLE
    );
    expect(out[0].id).toBe("real-id");
    expect(out[0].notes).toBe("garde");
    expect(out[0].taskCode).toBe("PARAPHARMACIE");
  });

  it("ABSENCE annule le taskCode (et inversement)", () => {
    const prev = [task("e1", "2026-06-29", "08:30")];
    const out = applyEntriesUpdate(
      prev,
      [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30", type: "ABSENCE", absenceCode: "CONGE" }],
      VISIBLE
    );
    expect(out[0].type).toBe("ABSENCE");
    expect(out[0].taskCode).toBeNull();
    expect(out[0].absenceCode).toBe("CONGE");
  });
});

describe("applyEntriesDelete", () => {
  it("supprime uniquement les cellules visibles ciblées", () => {
    const prev = [
      task("e1", "2026-06-29", "08:30"),
      task("e1", "2026-06-29", "09:00"),
      task("e2", "2099-01-01", "08:30"), // hors semaine → jamais supprimé
    ];
    const out = applyEntriesDelete(
      prev,
      [
        { employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" },
        { employeeId: "e2", date: "2099-01-01", timeSlot: "08:30" }, // ignoré (hors visible)
      ],
      VISIBLE
    );
    expect(out.map((e) => e.timeSlot + e.employeeId)).toEqual(["09:00e1", "08:30e2"]);
  });
});

describe("captureSnapshots", () => {
  it("before=null pour une case vide, contenu pour une case remplie", () => {
    const entries = [task("e1", "2026-06-29", "08:30", "COMPTOIR")];
    const snaps = captureSnapshots(entries, [
      { employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" },
      { employeeId: "e1", date: "2026-06-29", timeSlot: "09:00" }, // vide
    ]);
    expect(snaps[0].before).toEqual({ type: "TASK", taskCode: "COMPTOIR", absenceCode: null });
    expect(snaps[1].before).toBeNull();
  });

  it("déduplique les cellules répétées", () => {
    const snaps = captureSnapshots([], [
      { employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" },
      { employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" },
    ]);
    expect(snaps).toHaveLength(1);
  });
});

describe("usePlanningStore", () => {
  beforeEach(() => {
    usePlanningStore.setState({ entries: [], undoStack: [], redoStack: [] });
  });

  it("resetForWeek remplace les entrées et vide l'historique", () => {
    const s = usePlanningStore.getState();
    s.pushUndo("x", [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" }]);
    s.resetForWeek([task("e1", "2026-06-29", "08:30")]);
    const st = usePlanningStore.getState();
    expect(st.entries).toHaveLength(1);
    expect(st.undoStack).toHaveLength(0);
    expect(st.redoStack).toHaveLength(0);
  });

  it("pushUndo ne fait rien si aucune cellule", () => {
    usePlanningStore.getState().pushUndo("vide", []);
    expect(usePlanningStore.getState().undoStack).toHaveLength(0);
  });

  it("pushUndo vide la pile redo (nouvelle branche)", () => {
    usePlanningStore.setState({ redoStack: [{ label: "old", snapshots: [] }] });
    usePlanningStore.getState().pushUndo("a", [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" }]);
    expect(usePlanningStore.getState().redoStack).toHaveLength(0);
    expect(usePlanningStore.getState().undoStack).toHaveLength(1);
  });

  it("plafonne l'historique undo à 50", () => {
    const s = usePlanningStore.getState();
    for (let i = 0; i < 60; i++) {
      s.pushUndo(`a${i}`, [{ employeeId: "e1", date: "2026-06-29", timeSlot: `0${i % 9}:00` }]);
    }
    expect(usePlanningStore.getState().undoStack).toHaveLength(50);
  });

  it("popUndo dépile vers redo et renvoie l'action ; null si vide", () => {
    const s = usePlanningStore.getState();
    expect(s.popUndo()).toBeNull();
    s.applyUpdate(
      [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30", type: "TASK", taskCode: "COMPTOIR" }],
      VISIBLE
    );
    s.pushUndo("modif", [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" }]);
    const action = usePlanningStore.getState().popUndo();
    expect(action?.label).toBe("modif");
    expect(usePlanningStore.getState().undoStack).toHaveLength(0);
    expect(usePlanningStore.getState().redoStack).toHaveLength(1);
  });

  it("popUndo puis popRedo : aller-retour cohérent des piles", () => {
    const s = usePlanningStore.getState();
    s.pushUndo("modif", [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" }]);
    usePlanningStore.getState().popUndo();
    expect(usePlanningStore.getState().redoStack).toHaveLength(1);
    const redo = usePlanningStore.getState().popRedo();
    expect(redo?.label).toBe("modif");
    expect(usePlanningStore.getState().redoStack).toHaveLength(0);
    expect(usePlanningStore.getState().undoStack).toHaveLength(1);
  });

  it("applyUpdate/applyDelete modifient les entrées du store", () => {
    const s = usePlanningStore.getState();
    s.applyUpdate(
      [{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30", type: "TASK", taskCode: "COMPTOIR" }],
      VISIBLE
    );
    expect(usePlanningStore.getState().entries).toHaveLength(1);
    s.applyDelete([{ employeeId: "e1", date: "2026-06-29", timeSlot: "08:30" }], VISIBLE);
    expect(usePlanningStore.getState().entries).toHaveLength(0);
  });
});
