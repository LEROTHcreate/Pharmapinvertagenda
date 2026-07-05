import { describe, expect, it } from "vitest";
import { buildPayrollCsv, type PayrollCsvRow } from "./export-payroll-csv";
import type { PayrollLine } from "./payroll-calc";

const line: PayrollLine = {
  employeeId: "e1",
  employeeName: "Jean Dupont",
  status: "PREPARATEUR",
  seniorityMonths: 30,
  payMode: "HOURLY",
  hourlyGrossRate: 14.5,
  monthlyGrossSalary: null,
  effectiveHourlyRate: 14.5,
  coefficient: null,
  taskHoursRegular: 151.7,
  overtimeHours25: 4,
  overtimeHours50: 0,
  overtimeReference: "WEEKLY",
  overtimePeriods: [],
  paidLeaveHours: 0,
  trainingHours: 0,
  sickHoursEmployerPaid: 0,
  sickHoursWaitingPeriod: 0,
  sickHoursCpam: 0,
  unpaidAbsenceHours: 0,
  grossEmployer: 2280.5,
  socialContributionsEmployee: 501.71,
  netEstimated: 1778.79,
  socialContributionsEmployer: 957.81,
  totalEmployerCost: 3238.31,
  overtimePremiumCost: 14.5,
};

const row: PayrollCsvRow = {
  firstName: "Jean",
  lastName: "Dupont",
  status: "PREPARATEUR",
  contractType: "CDI",
  weeklyHours: 35,
  line,
};

describe("buildPayrollCsv", () => {
  it("génère un CSV avec BOM, séparateur ; et décimales à la virgule", () => {
    const csv = buildPayrollCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toContain("Nom;Prénom;Statut");
    expect(lines[1]).toContain("Dupont;Jean");
    expect(lines[1]).toContain("2280,50"); // brut en virgule décimale
    expect(lines[1]).toContain("4,0"); // heures sup 25%
  });

  it("échappe les champs contenant le séparateur", () => {
    const csv = buildPayrollCsv([{ ...row, lastName: "Dupont; SARL" }]);
    expect(csv).toContain('"Dupont; SARL"');
  });
});
