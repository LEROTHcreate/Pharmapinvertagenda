import { describe, expect, it } from "vitest";
import { buildPayrollWorkbook } from "./export-payroll-xlsx";
import type { PayrollLine } from "./payroll-calc";

const sampleLine: PayrollLine = {
  employeeId: "e1",
  employeeName: "Jean Dupont",
  status: "PREPARATEUR",
  seniorityMonths: 30,
  payMode: "HOURLY",
  hourlyGrossRate: 14.5,
  monthlyGrossSalary: null,
  effectiveHourlyRate: 14.5,
  coefficient: null,
  taskHoursRegular: 151.67,
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
  grossEmployer: 2280,
  socialContributionsEmployee: 501.6,
  netEstimated: 1778.4,
  socialContributionsEmployer: 957.6,
  totalEmployerCost: 3237.6,
  overtimePremiumCost: 14.5,
};

describe("export-payroll-xlsx", () => {
  it("génère un classeur Excel non vide", async () => {
    const buf = await buildPayrollWorkbook({
      pharmacyName: "Pharmacie Test",
      month: "2026-06",
      region: "IDF",
      lines: [sampleLine],
    });
    expect(buf.length).toBeGreaterThan(1000);
    // En-tête de fichier xlsx = archive ZIP → commence par "PK".
    expect(buf.toString("utf8", 0, 2)).toBe("PK");
  });

  it("gère un mois sans salarié sans planter", async () => {
    const buf = await buildPayrollWorkbook({
      pharmacyName: "Pharmacie Vide",
      month: "2026-06",
      region: "NATIONAL",
      lines: [],
    });
    expect(buf.length).toBeGreaterThan(0);
  });
});
