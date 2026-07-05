import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import {
  computePayrollLine,
  DEFAULT_PAYROLL_RATES,
  type EmployeeForPayroll,
  type PayrollRates,
} from "@/lib/payroll-calc";
import { toIsoDate } from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";

export const runtime = "nodejs";

/**
 * GET /api/payroll?month=YYYY-MM
 *
 * Renvoie les lignes de rémunération calculées pour le mois demandé.
 * Réservé aux super-admins + admins titulaires avec accès payroll.
 *
 * Sécurité multi-tenant : la requête ne lit QUE les Employee + ScheduleEntry
 * de la pharmacie de l'utilisateur connecté (filtre pharmacyId systématique).
 */
const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format attendu : YYYY-MM"),
});

async function GET__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Vérifie le rôle + le statut de l'Employee lié pour le filtrage titulaire
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
  const parsed = querySchema.safeParse({ month: url.searchParams.get("month") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètre 'month' invalide (format YYYY-MM)" },
      { status: 400 }
    );
  }

  const [year, monthNum] = parsed.data.month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0)); // Dernier jour du mois

  // ─── Charge employés actifs + entrées du mois + réglages (parallèle) ─
  const [employees, entries, pharmacy, revenue] = await Promise.all([
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
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
      select: {
        payrollRegion: true,
        payrollContribEmployee: true,
        payrollContribEmployer: true,
      },
    }),
    prisma.monthlyRevenue.findUnique({
      where: {
        pharmacyId_month: {
          pharmacyId: session.user.pharmacyId,
          month: parsed.data.month,
        },
      },
      select: { revenueHT: true, marginHT: true },
    }),
  ]);

  // Taux de cotisations : réglages pharmacie si présents, sinon défauts.
  const rates: PayrollRates = {
    ...DEFAULT_PAYROLL_RATES,
    socialContributionsEmployee:
      pharmacy?.payrollContribEmployee ??
      DEFAULT_PAYROLL_RATES.socialContributionsEmployee,
    socialContributionsEmployer:
      pharmacy?.payrollContribEmployer ??
      DEFAULT_PAYROLL_RATES.socialContributionsEmployer,
  };

  // Index entries par employé pour calcul rapide
  const entriesByEmp = new Map<string, ScheduleEntryDTO[]>();
  for (const e of entries) {
    const arr = entriesByEmp.get(e.employeeId) ?? [];
    arr.push({
      id: "", // pas utile pour le calcul
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

  // Total agrégé pour le récap
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

  return NextResponse.json({
    month: parsed.data.month,
    region: pharmacy?.payrollRegion ?? "NATIONAL",
    revenue: revenue ?? null,
    lines,
    totals: {
      grossEmployer: round2(totals.grossEmployer),
      netEstimated: round2(totals.netEstimated),
      socialContributionsEmployer: round2(totals.socialContributionsEmployer),
      totalEmployerCost: round2(totals.totalEmployerCost),
    },
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const GET = withErrorHandling(GET__impl);
