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
import { buildPayrollWorkbook } from "@/lib/export-payroll-xlsx";
import { REGION_LABELS, type Region } from "@/lib/payroll-reference";
import { toIsoDate } from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/payroll/export?month=YYYY-MM&region=IDF
 * Génère le classeur Excel de la rémunération du mois (masse salariale +
 * détail par salarié + benchmark). Mêmes droits que la page Rémunération.
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
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const allowed = canViewPayroll({
    role: me.role,
    employeeId: me.employeeId,
    canAccessPayroll: me.canAccessPayroll,
    employeeStatus: me.employee?.status ?? null,
  });
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "Paramètre 'month' invalide (YYYY-MM)" },
      { status: 400 }
    );
  }
  const regionParam = url.searchParams.get("region") ?? "NATIONAL";
  const region: Region =
    regionParam in REGION_LABELS ? (regionParam as Region) : "NATIONAL";

  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0));

  const [pharmacy, employees, entries] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: {
        name: true,
        payrollContribEmployee: true,
        payrollContribEmployer: true,
      },
    }),
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        weeklyHours: true,
        overtimeReference: true,
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
  ]);

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

  const rates: PayrollRates = {
    ...DEFAULT_PAYROLL_RATES,
    socialContributionsEmployee:
      pharmacy?.payrollContribEmployee ??
      DEFAULT_PAYROLL_RATES.socialContributionsEmployee,
    socialContributionsEmployer:
      pharmacy?.payrollContribEmployer ??
      DEFAULT_PAYROLL_RATES.socialContributionsEmployer,
  };

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

  const buffer = await buildPayrollWorkbook({
    pharmacyName: pharmacy?.name ?? "Pharmacie",
    month,
    region,
    lines,
  });

  const filename = `remuneration_${month}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

export const GET = withErrorHandling(GET__impl);
