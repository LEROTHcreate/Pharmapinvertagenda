import { describe, it, expect } from "vitest";
import {
  cpReferencePeriod,
  monthsAccruedInPeriod,
  cpAccrued,
  makeBalance,
  countAbsenceDays,
  absenceHours,
  semesterPeriod,
  hsAbsBalance,
  employeeLeaveCounters,
} from "./conges";
import { indexEntriesByEmployee } from "./planning-utils";
import type { ScheduleEntryDTO } from "@/types";

describe("cpReferencePeriod (juin → mai)", () => {
  it("date en juillet → période juin de l'année en cours → mai suivante", () => {
    expect(cpReferencePeriod(new Date("2026-07-15T12:00:00"))).toEqual({
      startIso: "2026-06-01",
      endIso: "2027-05-31",
      startYear: 2026,
    });
  });
  it("date en mars → période juin de l'année précédente", () => {
    expect(cpReferencePeriod(new Date("2026-03-10T12:00:00")).startYear).toBe(2025);
  });
});

describe("monthsAccruedInPeriod", () => {
  it("juin = 1 mois entamé", () => {
    expect(monthsAccruedInPeriod(new Date("2026-06-20T12:00:00"), 2026)).toBe(1);
  });
  it("décembre = 7 mois entamés", () => {
    expect(monthsAccruedInPeriod(new Date("2026-12-01T12:00:00"), 2026)).toBe(7);
  });
  it("mai suivant = 12 (plafond)", () => {
    expect(monthsAccruedInPeriod(new Date("2027-05-31T12:00:00"), 2026)).toBe(12);
  });
});

describe("cpAccrued", () => {
  it("2,5 j × mois + report, plafonné à 30", () => {
    expect(cpAccrued(4)).toBe(10); // 4 × 2,5
    expect(cpAccrued(12)).toBe(30); // 12 × 2,5
    expect(cpAccrued(12, { opening: 5 })).toBe(35); // plafond sur l'acquis, + report
    expect(cpAccrued(20, { cap: 30 })).toBe(30); // plafonné
  });
});

describe("makeBalance", () => {
  it("restant = acquis − pris", () => {
    expect(makeBalance(25, 10)).toEqual({ acquired: 25, taken: 10, remaining: 15 });
  });
});

// ─── Dérivation depuis le planning ───
let uid = 0;
function absence(
  out: ScheduleEntryDTO[],
  empId: string,
  date: string,
  code: string
) {
  // une journée d'absence = quelques créneaux du matin
  for (const s of ["09:00", "09:30", "10:00", "10:30"]) {
    out.push({
      id: `a${uid++}`,
      employeeId: empId,
      date,
      timeSlot: s,
      type: "ABSENCE",
      taskCode: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      absenceCode: code as any,
      notes: null,
    });
  }
}

describe("countAbsenceDays / absenceHours", () => {
  const e: ScheduleEntryDTO[] = [];
  absence(e, "p1", "2026-06-10", "CONGE");
  absence(e, "p1", "2026-06-11", "CONGE");
  absence(e, "p1", "2026-06-12", "MALADIE");
  const idx = indexEntriesByEmployee(e);
  const dates = ["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13"];

  it("compte les jours de CONGE distincts", () => {
    expect(countAbsenceDays("p1", dates, idx, "CONGE")).toBe(2);
  });
  it("heures d'absence toutes causes (4 créneaux = 2h/jour)", () => {
    expect(absenceHours("p1", dates, idx)).toBe(6); // 3 jours × 2h
  });
  it("heures d'absence filtrées (MALADIE seule)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(absenceHours("p1", dates, idx, ["MALADIE" as any])).toBe(2);
  });
});

describe("semesterPeriod", () => {
  it("mars → 1er semestre", () => {
    expect(semesterPeriod(new Date("2026-03-01T12:00:00")).label).toBe(
      "1er semestre 2026"
    );
  });
  it("septembre → 2e semestre", () => {
    expect(semesterPeriod(new Date("2026-09-01T12:00:00")).endIso).toBe(
      "2026-12-31"
    );
  });
});

describe("hsAbsBalance + employeeLeaveCounters", () => {
  it("HS-Abs = heures sup − heures absence", () => {
    expect(hsAbsBalance(20, 8)).toBe(12);
    expect(hsAbsBalance(5, 12)).toBe(-7);
  });
  it("agrège tous les compteurs", () => {
    const c = employeeLeaveCounters({
      monthsAccrued: 8,
      cpOpening: 5,
      cpTaken: 10,
      rttAcquired: 9,
      rttTaken: 3,
      recoveryEarnedHours: 12,
      recoveryTakenHours: 4,
      overtimeHours: 20,
      absenceHours: 8,
    });
    expect(c.cp).toEqual({ acquired: 25, taken: 10, remaining: 15 }); // 5 + 8×2,5
    expect(c.rtt.remaining).toBe(6);
    expect(c.recovery.remainingHours).toBe(8);
    expect(c.hsAbs.balanceHours).toBe(12);
  });
});
