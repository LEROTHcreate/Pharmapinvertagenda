import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import {
  computePayrollLine,
  type EmployeeForPayroll,
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

export async function GET(req: Request) {
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

  // ─── Charge employés actifs + entrées du mois (en parallèle) ──────
  const [employees, entries] = await Promise.all([
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        weeklyHours: true,
        hourlyGrossRate: true,
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
  ]);

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
      weeklyHours: emp.weeklyHours,
      hourlyGrossRate: emp.hourlyGrossRate,
      hireDate: emp.hireDate,
    };
    return computePayrollLine(
      empForCalc,
      entriesByEmp.get(emp.id) ?? [],
      monthStart
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
