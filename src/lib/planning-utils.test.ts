import { describe, expect, it } from "vitest";
import {
  isoWeekNumber,
  startOfWeek,
  toIsoDate,
  weekDays,
  weekTypeFor,
} from "./planning-utils";

describe("planning-utils", () => {
  describe("toIsoDate", () => {
    it("formate une date locale en YYYY-MM-DD", () => {
      const d = new Date(2026, 3, 28); // 28 avril 2026 (mois 3 = avril, 0-indexé)
      expect(toIsoDate(d)).toBe("2026-04-28");
    });

    it("pad les mois et jours à 2 chiffres", () => {
      expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    });
  });

  describe("startOfWeek", () => {
    it("renvoie le lundi pour un mardi", () => {
      // Mardi 28 avril 2026 → lundi 27 avril 2026
      const tue = new Date(2026, 3, 28);
      expect(toIsoDate(startOfWeek(tue))).toBe("2026-04-27");
    });

    it("renvoie le lundi pour un dimanche (cas piège)", () => {
      // Dim 3 mai 2026 → lundi 27 avril 2026
      const sun = new Date(2026, 4, 3);
      expect(toIsoDate(startOfWeek(sun))).toBe("2026-04-27");
    });

    it("renvoie le lundi lui-même quand on lui passe un lundi", () => {
      const mon = new Date(2026, 3, 27);
      expect(toIsoDate(startOfWeek(mon))).toBe("2026-04-27");
    });
  });

  describe("weekDays", () => {
    it("renvoie 6 jours consécutifs Lun → Sam", () => {
      const monday = new Date(2026, 3, 27);
      const days = weekDays(monday);
      expect(days).toHaveLength(6);
      expect(days.map(toIsoDate)).toEqual([
        "2026-04-27",
        "2026-04-28",
        "2026-04-29",
        "2026-04-30",
        "2026-05-01",
        "2026-05-02",
      ]);
    });
  });

  describe("isoWeekNumber + weekTypeFor", () => {
    it("renvoie un numéro de semaine cohérent", () => {
      // 1er janvier 2026 = jeudi → semaine ISO 1
      expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
    });

    it("S1 si semaine impaire, S2 si paire", () => {
      // Semaine 1 (impaire) → S1
      expect(weekTypeFor(new Date(2026, 0, 1))).toBe("S1");
      // Semaine 18 (paire) → S2 — 27 avril 2026 = semaine 18
      expect(weekTypeFor(new Date(2026, 3, 27))).toBe("S2");
    });
  });
});
