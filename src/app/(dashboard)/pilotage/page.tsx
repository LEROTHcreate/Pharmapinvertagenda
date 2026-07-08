import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import {
  DEFAULT_PAYROLL_RATES,
  type EmployeeForPayroll,
  type PayrollRates,
} from "@/lib/payroll-calc";
import { computeHrDashboard, lastMonths } from "@/lib/hr-dashboard";
import { toIsoDate } from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";
import { PilotageView } from "@/components/pilotage/PilotageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilotage RH · PharmaPlanning" };

/**
 * Tableau de bord RH (pilotage titulaire) : absentéisme, heures sup cumulées,
 * coût mensuel estimé et tendances sur 6 mois. Réservé aux profils autorisés au
 * module paie (les chiffres de coût sont sensibles) — même garde que /remuneration.
 */
export default async function PilotagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      employeeId: true,
      canAccessPayroll: true,
      employee: { select: { status: true } },
    },
  });
  if (!me) redirect("/login");
  const allowed = canViewPayroll({
    role: me.role,
    employeeId: me.employeeId,
    canAccessPayroll: me.canAccessPayroll,
    employeeStatus: me.employee?.status ?? null,
  });
  if (!allowed) redirect("/planning");

  const months = lastMonths(new Date(), 6);
  const rangeStart = months[0].start;
  const rangeEnd = months[months.length - 1].end;

  const [employees, entries, pharmacy] = await Promise.all([
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
        date: { gte: rangeStart, lte: rangeEnd },
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

  // CA HT des mois de la période (saisi dans Rémunération) → ratio masse
  // salariale / CA. Absent = ratio non affiché pour le mois.
  const revenues = await prisma.monthlyRevenue.findMany({
    where: {
      pharmacyId: session.user.pharmacyId,
      month: { in: months.map((m) => m.key) },
    },
    select: { month: true, revenueHT: true },
  });
  const revenueByMonth = new Map(revenues.map((r) => [r.month, r.revenueHT]));

  const rates: PayrollRates = {
    ...DEFAULT_PAYROLL_RATES,
    socialContributionsEmployee:
      pharmacy?.payrollContribEmployee ?? DEFAULT_PAYROLL_RATES.socialContributionsEmployee,
    socialContributionsEmployer:
      pharmacy?.payrollContribEmployer ?? DEFAULT_PAYROLL_RATES.socialContributionsEmployer,
  };

  const employeesForCalc: EmployeeForPayroll[] = employees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    status: e.status,
    weeklyHours: e.weeklyHours,
    overtimeReference: e.overtimeReference,
    payMode: e.payMode,
    hourlyGrossRate: e.hourlyGrossRate,
    monthlyGrossSalary: e.monthlyGrossSalary,
    coefficient: e.coefficient,
    hireDate: e.hireDate,
  }));

  const entriesDTO: ScheduleEntryDTO[] = entries.map((e) => ({
    id: "",
    employeeId: e.employeeId,
    date: toIsoDate(e.date),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: null,
  }));

  const data = computeHrDashboard(employeesForCalc, entriesDTO, months, rates, revenueByMonth);

  return <PilotageView data={data} />;
}
