import { describe, expect, it } from "vitest";
import {
  SLOT_HOURS,
  isoWeekKey,
  isoWeekStartUTC,
  weeklyOvertimeSplit,
} from "@/lib/work-hours";

describe("SLOT_HOURS", () => {
  it("vaut 0,5 h (créneau de 30 min)", () => {
    expect(SLOT_HOURS).toBe(0.5);
  });
});

describe("isoWeekStartUTC / isoWeekKey", () => {
  it("ramène chaque jour de la semaine au lundi", () => {
    // Semaine du lundi 2026-06-29 au dimanche 2026-07-05.
    for (const iso of [
      "2026-06-29", // lundi
      "2026-07-01", // mercredi
      "2026-07-04", // samedi
      "2026-07-05", // dimanche → toujours rattaché au lundi précédent
    ]) {
      expect(isoWeekKey(iso)).toBe("2026-06-29");
    }
  });

  it("le dimanche est rattaché au lundi PRÉCÉDENT (semaine ISO)", () => {
    expect(isoWeekKey("2026-07-05")).toBe("2026-06-29");
    expect(isoWeekKey("2026-07-06")).toBe("2026-07-06"); // lundi suivant
  });

  it("isoWeekStartUTC et isoWeekKey partagent la même définition", () => {
    const key = isoWeekStartUTC(new Date("2026-07-01T00:00:00Z"))
      .toISOString()
      .slice(0, 10);
    expect(key).toBe(isoWeekKey("2026-07-01"));
  });
});

describe("weeklyOvertimeSplit", () => {
  it("aucune heure sup sous ou égal au contrat", () => {
    expect(weeklyOvertimeSplit(35, 35)).toEqual({ total: 0, h25: 0, h50: 0 });
    expect(weeklyOvertimeSplit(30, 35)).toEqual({ total: 0, h25: 0, h50: 0 });
  });

  it("les 8 premières heures au-delà du contrat sont à +25 %", () => {
    expect(weeklyOvertimeSplit(40, 35)).toEqual({ total: 5, h25: 5, h50: 0 });
    expect(weeklyOvertimeSplit(43, 35)).toEqual({ total: 8, h25: 8, h50: 0 });
  });

  it("au-delà de 8 h sup, le surplus passe à +50 %", () => {
    expect(weeklyOvertimeSplit(46, 35)).toEqual({ total: 11, h25: 8, h50: 3 });
  });

  it("total = h25 + h50 (invariant partagé Stats ↔ Paie)", () => {
    for (const [w, c] of [
      [42, 35],
      [50, 35],
      [31, 30],
      [48, 30],
    ]) {
      const r = weeklyOvertimeSplit(w, c);
      expect(r.h25 + r.h50).toBe(r.total);
    }
  });
});