import { describe, expect, it } from "vitest";
import { ScheduleType } from "@prisma/client";
import type { ScheduleEntryDTO } from "@/types";
import {
  indexEntriesByEmployee,
  isoWeekNumber,
  staffingForSlot,
  startOfWeek,
  toIsoDate,
  weekDays,
  weekTypeFor,
  weekUnderstaffing,
} from "./planning-utils";

/** Fabrique une entry TASK minimale pour les tests d'effectif. */
function task(
  employeeId: string,
  taskCode: string
): ScheduleEntryDTO {
  return {
    id: `${employeeId}-${taskCode}`,
    employeeId,
    date: "2026-07-08",
    timeSlot: "09:00",
    type: ScheduleType.TASK,
    taskCode: taskCode as ScheduleEntryDTO["taskCode"],
    absenceCode: null,
    notes: null,
  };
}

describe("planning-utils", () => {
  describe("toIsoDate", () => {
    it("formate une date locale en YYYY-MM-DD", () => {
      const d = new Date(2026, 3, 28); // 28 avril 2026 (mois 3 = avril, 0-indexé)
      expect(toIsoDate(d)).toBe("2026-04-28");
    });

    it("pad les mois et jours à 2 chiffres", () => {
      expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    });

    // Régression : `unstable_cache` sérialise les Date en string ISO au
    // cache-hit → toIsoDate doit accepter une string sans planter (sinon
    // crash serveur de /planning et /infos).
    it("accepte une string ISO (Date sérialisée par le cache)", () => {
      expect(toIsoDate("2026-06-29T00:00:00.000Z")).toBe("2026-06-29");
      expect(toIsoDate("2026-06-29")).toBe("2026-06-29");
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

    it("S1 si semaine paire, S2 si impaire (convention officine)", () => {
      // Semaine 1 (impaire) → S2
      expect(weekTypeFor(new Date(2026, 0, 1))).toBe("S2");
      // Semaine 18 (paire) → S1 — 27 avril 2026 = semaine 18
      expect(weekTypeFor(new Date(2026, 3, 27))).toBe("S1");
    });
  });

  describe("staffingForSlot", () => {
    const DATE = "2026-07-08";
    const SLOT = "09:00";
    // ph1/ph2 = comptoir (pharmaciens), sec1 = secrétaire (hors comptoir),
    // liv1 = livreur (hors comptoir).
    const counterIds = ["ph1", "ph2"];
    const allIds = ["ph1", "ph2", "sec1", "liv1"];

    it("compte les rôles comptoir sur une vraie tâche", () => {
      const index = indexEntriesByEmployee([
        task("ph1", "COMPTOIR"),
        task("ph2", "COMPTOIR"),
      ]);
      expect(staffingForSlot(DATE, SLOT, counterIds, index)).toBe(2);
    });

    it("ignore ECHANGE (texturé, personne pas présente)", () => {
      const index = indexEntriesByEmployee([
        task("ph1", "COMPTOIR"),
        task("ph2", "ECHANGE"),
      ]);
      expect(staffingForSlot(DATE, SLOT, counterIds, index)).toBe(1);
    });

    it("compte un REMPLACEMENT fait par un rôle NON comptoir quand allIds est fourni", () => {
      const index = indexEntriesByEmployee([
        task("ph1", "COMPTOIR"),
        task("sec1", "REMPLACEMENT"), // secrétaire qui dépanne au comptoir
      ]);
      // Sans allIds : le remplaçant hors comptoir n'est pas compté.
      expect(staffingForSlot(DATE, SLOT, counterIds, index)).toBe(1);
      // Avec allIds : le remplaçant compte → il couvre le comptoir.
      expect(staffingForSlot(DATE, SLOT, counterIds, index, allIds)).toBe(2);
    });

    it("ne double-compte pas un rôle comptoir en REMPLACEMENT", () => {
      const index = indexEntriesByEmployee([
        task("ph1", "REMPLACEMENT"),
        task("ph2", "COMPTOIR"),
      ]);
      expect(staffingForSlot(DATE, SLOT, counterIds, index, allIds)).toBe(2);
    });

    it("ne compte pas les tâches hors comptoir des rôles hors comptoir (ex. LIVRAISON)", () => {
      const index = indexEntriesByEmployee([
        task("ph1", "COMPTOIR"),
        task("liv1", "LIVRAISON"), // livreur en tournée → hors effectif comptoir
      ]);
      expect(staffingForSlot(DATE, SLOT, counterIds, index, allIds)).toBe(1);
    });

    it("ne compte pas COMMANDE (back-office) même pour un rôle comptoir", () => {
      const counter = ["ph1", "prep1"];
      const all = ["ph1", "prep1"];
      const index = indexEntriesByEmployee([
        task("ph1", "COMPTOIR"),
        task("prep1", "COMMANDE"), // préparateur qui gère les commandes → hors comptoir
      ]);
      expect(staffingForSlot(DATE, SLOT, counter, index, all)).toBe(1);
    });
  });

  describe("weekUnderstaffing", () => {
    const DATE = "2026-07-08";
    /** Entrée TASK COMPTOIR sur un créneau précis. */
    function taskAt(employeeId: string, slot: string): ScheduleEntryDTO {
      return {
        id: `${employeeId}-${slot}`,
        employeeId,
        date: DATE,
        timeSlot: slot,
        type: ScheduleType.TASK,
        taskCode: "COMPTOIR" as ScheduleEntryDTO["taskCode"],
        absenceCode: null,
        notes: null,
      };
    }

    it("remonte les créneaux sous le seuil dans l'enveloppe de travail", () => {
      // ph1 09:00→10:00, ph2 seulement 09:00 → 09:30 tombe à 1 (seuil 2).
      const index = indexEntriesByEmployee([
        taskAt("ph1", "09:00"),
        taskAt("ph1", "09:30"),
        taskAt("ph2", "09:00"),
      ]);
      const res = weekUnderstaffing([DATE], ["ph1", "ph2"], index, 2);
      expect(res).toHaveLength(1);
      expect(res[0].dayIndex).toBe(0);
      expect(res[0].holes).toEqual([
        { from: "09:30", to: "10:00", level: "warning", minCount: 1 },
      ]);
    });

    it("ignore un jour sans personne au comptoir (avant ouverture / fermé)", () => {
      const index = indexEntriesByEmployee([]);
      expect(weekUnderstaffing([DATE], ["ph1"], index, 2)).toEqual([]);
    });

    it("classe en critical quand bien en dessous du seuil", () => {
      // Un seul présent, seuil 4 → 1 < 4-1 → critical.
      const index = indexEntriesByEmployee([taskAt("ph1", "09:00")]);
      const res = weekUnderstaffing([DATE], ["ph1"], index, 4);
      expect(res[0].holes[0].level).toBe("critical");
      expect(res[0].holes[0].minCount).toBe(1);
    });
  });
});
