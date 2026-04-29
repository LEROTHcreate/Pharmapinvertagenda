import { describe, expect, it } from "vitest";
import { analyzeCoverage } from "./coverage-analysis";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { indexEntriesByEmployee } from "./planning-utils";

/* ─── Helpers ──────────────────────────────────────────────── */

const PHARMACIST: EmployeeDTO = {
  id: "ph1",
  firstName: "Agnès",
  lastName: "—",
  status: "PHARMACIEN",
  weeklyHours: 35,
  displayColor: "#7c3aed",
  displayOrder: 0,
};

const PREPARER_A: EmployeeDTO = {
  id: "p1",
  firstName: "Aurélie",
  lastName: "—",
  status: "PREPARATEUR",
  weeklyHours: 35,
  displayColor: "#16a34a",
  displayOrder: 1,
};

const PREPARER_B: EmployeeDTO = {
  id: "p2",
  firstName: "Franco",
  lastName: "—",
  status: "PREPARATEUR",
  weeklyHours: 35,
  displayColor: "#15803d",
  displayOrder: 2,
};

const LIVREUR: EmployeeDTO = {
  id: "l1",
  firstName: "Patrick",
  lastName: "—",
  status: "LIVREUR",
  weeklyHours: 25,
  displayColor: "#475569",
  displayOrder: 3,
};

function task(employeeId: string, date: string, slot: string): ScheduleEntryDTO {
  return {
    id: `${employeeId}-${date}-${slot}`,
    employeeId,
    date,
    timeSlot: slot,
    type: "TASK",
    taskCode: "COMPTOIR",
    absenceCode: null,
    notes: null,
  };
}

function absence(employeeId: string, date: string, slot: string): ScheduleEntryDTO {
  return {
    id: `${employeeId}-${date}-${slot}-abs`,
    employeeId,
    date,
    timeSlot: slot,
    type: "ABSENCE",
    taskCode: null,
    absenceCode: "CONGE",
    notes: null,
  };
}

const SLOTS = ["09:00", "09:30", "10:00"];
const DATE = "2026-04-27";

describe("analyzeCoverage", () => {
  it("ne signale rien quand pharmacien et 2 préparateurs sont sur tous les créneaux", () => {
    const entries: ScheduleEntryDTO[] = [];
    SLOTS.forEach((s) => {
      entries.push(task(PHARMACIST.id, DATE, s));
      entries.push(task(PREPARER_A.id, DATE, s));
      entries.push(task(PREPARER_B.id, DATE, s));
    });
    const index = indexEntriesByEmployee(entries);
    const warnings = analyzeCoverage(
      [PHARMACIST, PREPARER_A, PREPARER_B],
      [DATE],
      index,
      SLOTS
    );
    expect(warnings).toEqual([]);
  });

  it("signale 'no-pharmacist' quand aucun pharmacien actif", () => {
    const entries: ScheduleEntryDTO[] = [];
    SLOTS.forEach((s) => {
      entries.push(task(PREPARER_A.id, DATE, s));
      entries.push(task(PREPARER_B.id, DATE, s));
    });
    const index = indexEntriesByEmployee(entries);
    const warnings = analyzeCoverage(
      [PHARMACIST, PREPARER_A, PREPARER_B],
      [DATE],
      index,
      SLOTS
    );
    const noPharm = warnings.find((w) => w.kind === "no-pharmacist");
    expect(noPharm).toBeDefined();
    expect(noPharm?.date).toBe(DATE);
  });

  it("signale 'few-preparers' quand seulement 1 préparateur actif", () => {
    const entries: ScheduleEntryDTO[] = [];
    SLOTS.forEach((s) => {
      entries.push(task(PHARMACIST.id, DATE, s));
      entries.push(task(PREPARER_A.id, DATE, s));
    });
    const index = indexEntriesByEmployee(entries);
    const warnings = analyzeCoverage(
      [PHARMACIST, PREPARER_A, PREPARER_B],
      [DATE],
      index,
      SLOTS
    );
    const few = warnings.find((w) => w.kind === "few-preparers");
    expect(few).toBeDefined();
    if (few?.kind === "few-preparers") {
      expect(few.minCount).toBe(1);
    }
  });

  it("signale 'livreur-absent' quand le livreur a une absence et aucune tâche", () => {
    const index = indexEntriesByEmployee([
      absence(LIVREUR.id, DATE, "14:30"),
    ]);
    const warnings = analyzeCoverage([LIVREUR], [DATE], index, SLOTS);
    const liv = warnings.find((w) => w.kind === "livreur-absent");
    expect(liv).toBeDefined();
    if (liv?.kind === "livreur-absent") {
      expect(liv.employeeName).toBe("Patrick");
    }
  });

  it("ne signale PAS livreur-absent si le livreur a aussi une tâche le même jour", () => {
    const index = indexEntriesByEmployee([
      absence(LIVREUR.id, DATE, "14:30"),
      task(LIVREUR.id, DATE, "15:00"),
    ]);
    const warnings = analyzeCoverage([LIVREUR], [DATE], index, SLOTS);
    expect(warnings.find((w) => w.kind === "livreur-absent")).toBeUndefined();
  });

  it("compacte les créneaux contigus en plages (slots consécutifs → une seule range)", () => {
    // Pas de pharmacien sur les 3 slots → doit donner 1 plage compactée 09:00-10:30
    const index = indexEntriesByEmployee([]);
    const warnings = analyzeCoverage([PHARMACIST], [DATE], index, SLOTS);
    const noPharm = warnings.find((w) => w.kind === "no-pharmacist");
    expect(noPharm?.kind).toBe("no-pharmacist");
    if (noPharm?.kind === "no-pharmacist") {
      expect(noPharm.slots).toEqual(["09:00-10:30"]);
    }
  });
});
