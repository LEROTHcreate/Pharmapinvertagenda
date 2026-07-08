import { describe, expect, it } from "vitest";
import { parsePastedDay, type ImportEmployee } from "./excel-import";

const SLOTS = ["08:00", "08:30", "09:00"];
const TEAM: ImportEmployee[] = [
  { id: "a", firstName: "Agnès", lastName: "Martin" },
  { id: "b", firstName: "Cyril", lastName: "Durand" },
];

function parse(text: string) {
  return parsePastedDay({ text, dayOfWeek: 0, employees: TEAM, timeSlots: SLOTS });
}

describe("parsePastedDay", () => {
  it("mappe les postes et associe les prénoms", () => {
    const text = ["Heure\tAgnès\tCyril", "8:00\tCptoir\tPara", "8h30\tComptoir\t"].join("\n");
    const r = parse(text);
    expect(r.matchedNames).toEqual(["Agnès", "Cyril"]);
    // Agnès 8:00 Comptoir, Cyril 8:00 Para, Agnès 8:30 Comptoir → 3 entrées
    expect(r.entries).toHaveLength(3);
    const agnes0800 = r.entries.find((e) => e.employeeId === "a" && e.timeSlot === "08:00");
    expect(agnes0800).toMatchObject({ type: "TASK", taskCode: "COMPTOIR" });
    const cyril0800 = r.entries.find((e) => e.employeeId === "b" && e.timeSlot === "08:00");
    expect(cyril0800).toMatchObject({ type: "TASK", taskCode: "PARAPHARMACIE" });
  });

  it("reconnaît les absences", () => {
    const text = ["Heure\tAgnès", "8:00\tCongé"].join("\n");
    const r = parse(text);
    expect(r.entries[0]).toMatchObject({ type: "ABSENCE", absenceCode: "CONGE" });
  });

  it("normalise les horaires (8h, 08:00, 8:00) et ignore les créneaux hors grille", () => {
    const text = ["Heure\tAgnès", "8h\tCptoir", "10:00\tCptoir"].join("\n");
    const r = parse(text); // 10:00 n'est pas dans SLOTS → ignoré
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].timeSlot).toBe("08:00");
  });

  it("avertit sur un poste inconnu et une colonne non reconnue", () => {
    const text = ["Heure\tAgnès\tInconnu", "8:00\tBlabla\tCptoir"].join("\n");
    const r = parse(text);
    expect(r.unmatchedNames).toContain("Inconnu");
    expect(r.warnings.some((w) => w.includes("Blabla"))).toBe(true);
    // Seule la colonne reconnue (Agnès) compte, et « Blabla » est ignoré → 0 entrée
    expect(r.entries).toHaveLength(0);
  });

  it("déboublonne (dernier gagne) sur un même créneau", () => {
    const text = ["Heure\tAgnès", "8:00\tCptoir", "8:00\tPara"].join("\n");
    const r = parse(text);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].taskCode).toBe("PARAPHARMACIE");
  });
});
