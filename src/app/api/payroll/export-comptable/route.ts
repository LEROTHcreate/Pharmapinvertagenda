import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import {
  computePayrollLine,
  DEFAULT_PAYROLL_RATES,
  type EmployeeForPayroll,
  type PayrollRates,
} from "@/lib/payroll-calc";
import { buildPayrollCsv, type PayrollCsvRow } from "@/lib/export-payroll-csv";
import { toIsoDate } from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/payroll/export-comptable?month=YYYY-MM
 * CSV détaillé (heures ventilées + montants) pour le comptable / import paie.
 * Mêmes droits que la page Rémunération.
 */
async function GET__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      employeeId: true,
      canAccessPayroll: true,
      employee: { select: { status: true } },
    },
  });
  if (
    !me ||
    !canViewPayroll({
      role: me.role,
      employeeId: me.employeeId,
      canAccessPayroll: me.canAccessPayroll,
      employeeStatus: me.employee?.status ?? null,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Paramètre 'month' invalide (YYYY-MM)" }, { status: 400 });
  }
  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0));

  const [employees, entries, pharmacy] = await Promise.all([
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        contractType: true,
        weeklyHours: true,
        payMode: true,
        hourlyGrossRate: true,
        monthlyGrossSalary: true,
        coefficient: true,
        hireDate: true,
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        date: { gte: monthStart, lte: monthEnd },
      },
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
      where: { id: session.user.pharmacyId },
      select: { payrollContribEmployee: true, payrollContribEmployer: true },
    }),
  ]);

  const rates: PayrollRates = {
    ...DEFAULT_PAYROLL_RATES,
    socialContributionsEmployee:
      pharmacy?.payrollContribEmployee ?? DEFAULT_PAYROLL_RATES.socialContributionsEmployee,
    socialContributionsEmployer:
      pharmacy?.payrollContribEmployer ?? DEFAULT_PAYROLL_RATES.socialContributionsEmployer,
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

  const rows: PayrollCsvRow[] = employees.map((emp) => {
    const empForCalc: EmployeeForPayroll = {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      status: emp.status,
      weeklyHours: emp.weeklyHours,
      payMode: emp.payMode,
      hourlyGrossRate: emp.hourlyGrossRate,
      monthlyGrossSalary: emp.monthlyGrossSalary,
      coefficient: emp.coefficient,
      hireDate: emp.hireDate,
    };
    return {
      firstName: emp.firstName,
      lastName: emp.lastName,
      status: emp.status,
      contractType: emp.contractType,
      weeklyHours: emp.weeklyHours,
      line: computePayrollLine(empForCalc, entriesByEmp.get(emp.id) ?? [], monthStart, rates),
    };
  });

  const csv = buildPayrollCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="remuneration_${month}_comptable.csv"`,
      "cache-control": "no-store",
    },
  });
}

export const GET = withErrorHandling(GET__impl);
