import { describe, expect, it } from "vitest";
import { ScheduleType, type TaskCode } from "@prisma/client";
import { computePayrollLine, type EmployeeForPayroll } from "./payroll-calc";
import type { ScheduleEntryDTO } from "@/types";

const MONTH = new Date(Date.UTC(2026, 5, 1)); // juin 2026

/** Génère `hours` heures de TASK (1 créneau = 0,5 h). */
function taskHours(hours: number): ScheduleEntryDTO[] {
  const slots = Math.round(hours * 2);
  return Array.from({ length: slots }, () => ({
    id: "",
    employeeId: "e",
    date: "2026-06-01",
    timeSlot: "08:00",
    type: ScheduleType.TASK,
    taskCode: "COMPTOIR" as TaskCode,
    absenceCode: null,
    notes: null,
  }));
}

function emp(partial: Partial<EmployeeForPayroll>): EmployeeForPayroll {
  return {
    id: "e",
    firstName: "Test",
    lastName: "Employé",
    status: "PREPARATEUR",
    weeklyHours: 35,
    payMode: "HOURLY",
    hourlyGrossRate: null,
    monthlyGrossSalary: null,
    coefficient: null,
    hireDate: null,
    ...partial,
  };
}

describe("computePayrollLine — mode HORAIRE", () => {
  it("paie les heures travaillées au taux (sous le contrat = pas d'heures sup)", () => {
    const line = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 35 }),
      taskHours(100),
      MONTH
    );
    expect(line.overtimeHours25 + line.overtimeHours50).toBe(0);
    expect(line.grossEmployer).toBeCloseTo(1500, 0); // 100h × 15
    expect(line.effectiveHourlyRate).toBe(15);
  });
});

describe("computePayrollLine — mode MENSUEL", () => {
  it("verse le salaire mensuel fixe même si moins d'heures planifiées", () => {
    const line = computePayrollLine(
      emp({ payMode: "MONTHLY", monthlyGrossSalary: 2000, weeklyHours: 35 }),
      taskHours(100), // < contrat (151,67h) → mensualisé maintenu
      MONTH
    );
    expect(line.grossEmployer).toBeCloseTo(2000, 0);
    // Taux horaire implicite = 2000 / 151,67 ≈ 13,19
    expect(line.effectiveHourlyRate).toBeCloseTo(13.19, 1);
  });

  it("ajoute les heures sup EN PLUS du salaire mensuel", () => {
    const line = computePayrollLine(
      emp({ payMode: "MONTHLY", monthlyGrossSalary: 2000, weeklyHours: 35 }),
      taskHours(170), // > contrat → heures sup
      MONTH
    );
    expect(line.overtimeHours25 + line.overtimeHours50).toBeGreaterThan(0);
    expect(line.grossEmployer).toBeGreaterThan(2000);
  });
});

describe("computePayrollLine — heures contractuelles respectées", () => {
  it("déclenche des heures sup à 30h mais pas à 35h pour 140h travaillées", () => {
    const work = taskHours(140);
    const at30 = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 30 }),
      work,
      MONTH
    );
    const at35 = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 35 }),
      work,
      MONTH
    );
    // 30h → contrat mensuel 130h → 140h = heures sup
    expect(at30.overtimeHours25 + at30.overtimeHours50).toBeGreaterThan(0);
    // 35h → contrat mensuel 151,67h → 140h < contrat = pas d'heures sup
    expect(at35.overtimeHours25 + at35.overtimeHours50).toBe(0);
  });
});
