import { describe, expect, it } from "vitest";
import { fillComptoirGaps, type AutoFillEmployee } from "./auto-fill";
import type { WeekHours } from "./opening-hours";

// Créneaux 08:00 → 10:00 (4 créneaux de 30 min) pour des tests compacts.
const SLOTS = ["08:00", "08:30", "09:00", "09:30"];
// Ouvert Lundi 08:00–10:00, fermé le reste.
const HOURS: WeekHours = [
  [{ open: "08:00", close: "10:00" }],
  [],
  [],
  [],
  [],
  [],
  [],
];
const MON = "2026-07-06"; // un lundi
const WEEK = [MON, "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"];

function emp(id: string, weeklyHours = 35): AutoFillEmployee {
  return { id, status: "PREPARATEUR", weeklyHours };
}

function run(over: Partial<Parameters<typeof fillComptoirGaps>[0]>) {
  return fillComptoirGaps({
    weekDates: WEEK,
    timeSlots: SLOTS,
    openingHours: HOURS,
    minStaff: 2,
    employees: [emp("a"), emp("b"), emp("c")],
    existing: [],
    wishes: [],
    absences: [],
    ...over,
  });
}

describe("fillComptoirGaps", () => {
  it("comble jusqu'au seuil mini sur les heures d'ouverture", () => {
    const rows = run({});
    // 4 créneaux × 2 personnes requises = 8 affectations.
    expect(rows.length).toBe(8);
    // Toutes le lundi, en COMPTOIR implicite (COMPTOIR-only rows).
    expect(rows.every((r) => r.date === MON)).toBe(true);
    // 2 personnes distinctes par créneau.
    for (const s of SLOTS) {
      const onSlot = rows.filter((r) => r.timeSlot === s);
      expect(onSlot.length).toBe(2);
      expect(new Set(onSlot.map((r) => r.employeeId)).size).toBe(2);
    }
  });

  it("ne touche pas les jours fermés (aucune ligne hors lundi)", () => {
    const rows = run({});
    expect(rows.some((r) => r.date !== MON)).toBe(false);
  });

  it("respecte les cases déjà occupées (complète les trous seulement)", () => {
    const rows = run({
      existing: [
        { employeeId: "a", date: MON, timeSlot: "08:00", type: "TASK", taskCode: "COMPTOIR" },
      ],
    });
    // a est déjà à 08:00 → on ne le réaffecte pas sur ce créneau.
    const at0800 = rows.filter((r) => r.timeSlot === "08:00");
    expect(at0800.some((r) => r.employeeId === "a")).toBe(false);
    // il ne manque qu'1 personne à 08:00 (a compte déjà) → 1 ajout.
    expect(at0800.length).toBe(1);
  });

  it("n'affecte pas une personne absente ce jour", () => {
    const rows = run({
      absences: [{ employeeId: "a", startIso: MON, endIso: MON }],
    });
    expect(rows.some((r) => r.employeeId === "a")).toBe(false);
  });

  it("ignore une personne indisponible (UNAVAILABLE)", () => {
    const rows = run({
      wishes: [{ employeeId: "b", date: MON, kind: "UNAVAILABLE" }],
    });
    expect(rows.some((r) => r.employeeId === "b")).toBe(false);
  });

  it("ne dépasse pas les heures contractuelles", () => {
    // Chacun plafonné à 1 h (2 créneaux) → 3 pers × 2 créneaux = 6 affectations
    // possibles, alors que 8 seraient nécessaires → 2 trous laissés.
    const rows = run({
      employees: [emp("a", 1), emp("b", 1), emp("c", 1)],
    });
    expect(rows.length).toBe(6);
    for (const id of ["a", "b", "c"]) {
      expect(rows.filter((r) => r.employeeId === id).length).toBe(2); // 1 h max
    }
  });

  it("ne propose pas les statuts non comptoir (ex : livreur)", () => {
    const rows = run({
      employees: [{ id: "liv", status: "LIVREUR", weeklyHours: 35 }],
    });
    expect(rows.length).toBe(0);
  });
});
