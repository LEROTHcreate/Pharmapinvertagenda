import { describe, it, expect } from "vitest";
import {
  getHolidaysFR,
  holidayForDate,
  holidaysIndexForDates,
} from "./holidays-fr";

describe("getHolidaysFR", () => {
  it("renvoie les 11 fériés métropole", () => {
    expect(getHolidaysFR(2026)).toHaveLength(11);
  });

  it("contient les fériés à date fixe", () => {
    const dates = getHolidaysFR(2026).map((h) => h.date);
    for (const d of [
      "2026-01-01", // Jour de l'an
      "2026-05-01", // Fête du travail
      "2026-05-08", // Victoire 1945
      "2026-07-14", // Fête nationale
      "2026-08-15", // Assomption
      "2026-11-01", // Toussaint
      "2026-11-11", // Armistice
      "2026-12-25", // Noël
    ]) {
      expect(dates).toContain(d);
    }
  });

  it("calcule correctement les fériés mobiles dérivés de Pâques (2026)", () => {
    // Pâques 2026 = dimanche 5 avril
    const byDate = new Map(getHolidaysFR(2026).map((h) => [h.name, h.date]));
    expect(byDate.get("Lundi de Pâques")).toBe("2026-04-06");
    expect(byDate.get("Ascension")).toBe("2026-05-14"); // Pâques + 39
    expect(byDate.get("Lundi de Pentecôte")).toBe("2026-05-25"); // Pâques + 50
  });

  it("fériés mobiles 2025 (Pâques = 20 avril)", () => {
    const byDate = new Map(getHolidaysFR(2025).map((h) => [h.name, h.date]));
    expect(byDate.get("Lundi de Pâques")).toBe("2025-04-21");
    expect(byDate.get("Ascension")).toBe("2025-05-29");
    expect(byDate.get("Lundi de Pentecôte")).toBe("2025-06-09");
  });
});

describe("holidayForDate", () => {
  it("renvoie le férié pour une date fériée", () => {
    expect(holidayForDate("2026-05-01")?.name).toBe("Fête du travail");
    expect(holidayForDate("2026-04-06")?.name).toBe("Lundi de Pâques");
  });
  it("renvoie null pour une date ordinaire", () => {
    expect(holidayForDate("2026-07-15")).toBeNull();
  });
  it("renvoie null pour une date invalide", () => {
    expect(holidayForDate("pas-une-date")).toBeNull();
  });
});

describe("holidaysIndexForDates", () => {
  it("ne garde que les dates demandées qui sont fériées", () => {
    const idx = holidaysIndexForDates([
      "2026-05-08", // férié
      "2026-05-09", // non
      "2026-05-14", // férié (Ascension)
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get("2026-05-08")?.short).toBe("8 mai");
    expect(idx.get("2026-05-14")?.name).toBe("Ascension");
    expect(idx.has("2026-05-09")).toBe(false);
  });

  it("gère un range couvrant deux années", () => {
    const idx = holidaysIndexForDates(["2025-12-25", "2026-01-01"]);
    expect(idx.size).toBe(2);
    expect(idx.get("2025-12-25")?.name).toBe("Noël");
    expect(idx.get("2026-01-01")?.name).toBe("Jour de l'an");
  });
});
