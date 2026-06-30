import { describe, it, expect } from "vitest";
import {
  analyzeCcnCompliance,
  weeklyOvertimeBreakdown,
} from "./ccn-compliance";
import { indexEntriesByEmployee } from "./planning-utils";
import { TIME_SLOTS } from "@/types";
import type { ScheduleEntryDTO } from "@/types";

// Semaine Lun → Sam
const WD = [
  "2026-06-22",
  "2026-06-23",
  "2026-06-24",
  "2026-06-25",
  "2026-06-26",
  "2026-06-27",
];

let uid = 0;
function fill(
  out: ScheduleEntryDTO[],
  empId: string,
  date: string,
  from: string,
  to: string
) {
  for (const s of TIME_SLOTS) {
    if (s >= from && s < to) {
      out.push({
        id: `e${uid++}`,
        employeeId: empId,
        date,
        timeSlot: s,
        type: "TASK",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        taskCode: "COMPTOIR" as any,
        absenceCode: null,
        notes: null,
      });
    }
  }
}
const emp = (id: string) => ({ id, firstName: "Léa" });
const types = (vs: ReturnType<typeof analyzeCcnCompliance>) => vs.map((v) => v.type);

describe("analyzeCcnCompliance", () => {
  it("planning conforme (Lun→Ven, 09:00-12:30 / 14:00-18:00, samedi off) → 0 manquement", () => {
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD.slice(0, 5)) {
      fill(e, "p1", d, "09:00", "12:30");
      fill(e, "p1", d, "14:00", "18:00");
    }
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(v).toEqual([]);
  });

  it("repos quotidien < 11h (finit 21:30, reprend 07:30 → 10h) → erreur REPOS_QUOTIDIEN", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "14:00", "21:30");
    fill(e, "p1", WD[1], "07:30", "12:00");
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("REPOS_QUOTIDIEN");
    expect(v.find((x) => x.type === "REPOS_QUOTIDIEN")?.severity).toBe("error");
  });

  it("plus de 10h de travail dans la journée → erreur DUREE_MAX_JOUR", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "19:00"); // 11h
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("DUREE_MAX_JOUR");
  });

  it("journée fractionnée en 3 séquences (2 coupures) → COUPURE", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "10:00");
    fill(e, "p1", WD[0], "11:00", "13:00");
    fill(e, "p1", WD[0], "15:00", "17:00");
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("COUPURE");
  });

  it("travail continu > 6h → PAUSE", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "14:30"); // 6h30 continu
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("PAUSE");
  });

  it("6 h PILE sans pause → PAUSE (seuil inclusif, ≥ et non >)", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "14:00"); // exactement 6h00 continu
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("PAUSE");
  });

  it("≥ 6h MAIS avec une coupure ≥ 20 min → pas de PAUSE", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "11:30"); // 3h30
    fill(e, "p1", WD[0], "12:00", "15:00"); // + 3h, coupure 30 min entre les deux
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).not.toContain("PAUSE");
  });

  it("7 jours travaillés d'affilée → erreur REPOS_HEBDO (max 6 consécutifs)", () => {
    const WD7 = [...WD, "2026-06-28"]; // + dimanche
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD7) fill(e, "p1", d, "09:00", "12:00");
    const v = analyzeCcnCompliance([emp("p1")], WD7, indexEntriesByEmployee(e));
    expect(
      v.some((x) => x.type === "REPOS_HEBDO" && x.severity === "error")
    ).toBe(true);
  });

  it("travaille les 6 jours → warning REPOS_HEBDO", () => {
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD) fill(e, "p1", d, "09:00", "12:00");
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("REPOS_HEBDO");
    expect(v.find((x) => x.type === "REPOS_HEBDO")?.severity).toBe("warning");
  });
});

describe("weeklyOvertimeBreakdown", () => {
  it("35h → aucune heure sup", () => {
    expect(weeklyOvertimeBreakdown(35)).toEqual({
      workedHours: 35,
      normalHours: 35,
      hs25: 0,
      hs50: 0,
    });
  });
  it("40h → 5h à +25%", () => {
    expect(weeklyOvertimeBreakdown(40)).toEqual({
      workedHours: 40,
      normalHours: 35,
      hs25: 5,
      hs50: 0,
    });
  });
  it("48h → 8h à +25% puis 5h à +50%", () => {
    expect(weeklyOvertimeBreakdown(48)).toEqual({
      workedHours: 48,
      normalHours: 35,
      hs25: 8,
      hs50: 5,
    });
  });
});
