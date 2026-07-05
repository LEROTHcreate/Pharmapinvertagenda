import { describe, it, expect } from "vitest";
import { ScheduleType } from "@prisma/client";
import { buildEmployeeStats } from "./stats";

// 20 créneaux TASK le lundi 2026-06-29 (même semaine ISO) = 10 h de travail.
// Contrat 8 h → 2 h supplémentaires pour un statut « normal ».
function week10hEntries(employeeId: string) {
  return Array.from({ length: 20 }, () => ({
    employeeId,
    type: ScheduleType.TASK,
    date: new Date("2026-06-29T09:00:00Z"),
    absenceCode: null,
  }));
}

function emp(over: Partial<Parameters<typeof buildEmployeeStats>[0][number]> = {}) {
  return {
    id: "e1",
    firstName: "Jean",
    lastName: "Titu",
    status: "PREPARATEUR" as const,
    weeklyHours: 8,
    displayColor: "#000",
    titulaireCountsOvertime: false,
    ...over,
  };
}

describe("buildEmployeeStats — heures sup titulaire", () => {
  it("collaborateur normal : les heures sup sont comptées", () => {
    const [s] = buildEmployeeStats([emp()], week10hEntries("e1"));
    expect(s.overtimeHours).toBe(2);
  });

  it("titulaire par défaut (dividendes) : heures sup NON comptées + solde HS-Abs à 0", () => {
    const [s] = buildEmployeeStats(
      [emp({ status: "TITULAIRE", titulaireCountsOvertime: false })],
      week10hEntries("e1")
    );
    expect(s.overtimeHours).toBe(0);
    expect(s.hsAbsBalance).toBe(0);
  });

  it("titulaire en mode classique : les heures sup sont comptées", () => {
    const [s] = buildEmployeeStats(
      [emp({ status: "TITULAIRE", titulaireCountsOvertime: true })],
      week10hEntries("e1")
    );
    expect(s.overtimeHours).toBe(2);
  });
});
