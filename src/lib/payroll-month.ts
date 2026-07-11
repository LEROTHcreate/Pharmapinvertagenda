import { prisma } from "@/lib/prisma";
import {
  computePayrollLine,
  DEFAULT_PAYROLL_RATES,
  type EmployeeForPayroll,
  type PayrollLine,
  type PayrollRates,
} from "@/lib/payroll-calc";
import { toIsoDate } from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";

/**
 * Résultat du calcul de rémunération pour un mois donné — partagé par l'API
 * (`/api/payroll`) et la page imprimable (`/remuneration/imprimer`). Évite de
 * dupliquer l'orchestration (fetch employés + créneaux + réglages → calcul).
 */
export type PayrollMonthResult = {
  month: string;
  region: string;
  annualBudget: number | null;
  employerRate: number;
  revenue: { revenueHT: number; marginHT: number | null } | null;
  lines: PayrollLine[];
  totals: {
    grossEmployer: number;
    netEstimated: number;
    socialContributionsEmployer: number;
    totalEmployerCost: number;
  };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcule les lignes de rémunération + totaux d'une officine pour un mois
 * (format "YYYY-MM"). Multi-tenant : ne lit QUE les données de `pharmacyId`.
 * Le contrôle d'accès (RBAC payroll) est à la charge de l'appelant.
 */
export async function computePayrollForMonth(
  pharmacyId: string,
  month: string
): Promise<PayrollMonthResult> {
  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0)); // dernier jour du mois

  const [employees, entries, pharmacy, revenue] = await Promise.all([
    prisma.employee.findMany({
      where: { pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        weeklyHours: true,
        overtimeReference: true,
        payMode: true,
        hourlyGrossRate: true,
        monthlyGrossSalary: true,
        coefficient: true,
        hireDate: true,
        status: true,
      },
    }),
    prisma.scheduleEntry.findMany({
      where: { pharmacyId, date: { gte: monthStart, lte: monthEnd } },
      select: {
        employeeId: true,
        date: true,
        timeSlot: true,
        type: true,
        taskCode: true,
        absenceCode: true,
      },
    }),
    prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: {
        payrollRegion: true,
        payrollContribEmployee: true,
        payrollContribEmployer: true,
        payrollAnnualBudget: true,
      },
    }),
    prisma.monthlyRevenue.findUnique({
      where: { pharmacyId_month: { pharmacyId, month } },
      select: { revenueHT: true, marginHT: true },
    }),
  ]);

  const rates: PayrollRates = {
    ...DEFAULT_PAYROLL_RATES,
    socialContributionsEmployee:
      pharmacy?.payrollContribEmployee ??
      DEFAULT_PAYROLL_RATES.socialContributionsEmployee,
    socialContributionsEmployer:
      pharmacy?.payrollContribEmployer ??
      DEFAULT_PAYROLL_RATES.socialContributionsEmployer,
  };

  const entriesByEmp = new Map<string, ScheduleEntryDTO[]>();
  for (const e of entries) {
    const arr = entriesByEmp.get(e.employeeId) ?? [];
    arr.push({
      id: "",
      employeeId: e.employeeId,
      date: toIsoDate(e.date),
      timeSlot: e.timeSlot,
      type: e.type,
      taskCode: e.taskCode,
      absenceCode: e.absenceCode,
      notes: null,
    });
    entriesByEmp.set(e.employeeId, arr);
  }

  const lines = employees.map((emp) => {
    const empForCalc: EmployeeForPayroll = {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      status: emp.status,
      weeklyHours: emp.weeklyHours,
      overtimeReference: emp.overtimeReference,
      payMode: emp.payMode,
      hourlyGrossRate: emp.hourlyGrossRate,
      monthlyGrossSalary: emp.monthlyGrossSalary,
      coefficient: emp.coefficient,
      hireDate: emp.hireDate,
    };
    return computePayrollLine(
      empForCalc,
      entriesByEmp.get(emp.id) ?? [],
      monthStart,
      rates
    );
  });

  const totals = lines.reduce(
    (acc, l) => ({
      grossEmployer: acc.grossEmployer + l.grossEmployer,
      netEstimated: acc.netEstimated + l.netEstimated,
      socialContributionsEmployer:
        acc.socialContributionsEmployer + l.socialContributionsEmployer,
      totalEmployerCost: acc.totalEmployerCost + l.totalEmployerCost,
    }),
    {
      grossEmployer: 0,
      netEstimated: 0,
      socialContributionsEmployer: 0,
      totalEmployerCost: 0,
    }
  );

  return {
    month,
    region: pharmacy?.payrollRegion ?? "NATIONAL",
    annualBudget: pharmacy?.payrollAnnualBudget ?? null,
    employerRate: rates.socialContributionsEmployer,
    revenue: revenue ?? null,
    lines,
    totals: {
      grossEmployer: round2(totals.grossEmployer),
      netEstimated: round2(totals.netEstimated),
      socialContributionsEmployer: round2(totals.socialContributionsEmployer),
      totalEmployerCost: round2(totals.totalEmployerCost),
    },
  };
}
