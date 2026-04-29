import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toIsoDate } from "@/lib/planning-utils";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { MonthHeader } from "@/components/planning/MonthHeader";
import { MonthOverview } from "@/components/planning/MonthOverview";

export const metadata = { title: "Vue mois · PharmaPlanning" };

/** Parse "YYYY-MM" → 1er du mois (timezone locale). Fallback : mois en cours. */
function resolveMonth(input?: string): { y: number; m: number } {
  if (input && /^\d{4}-\d{2}$/.test(input)) {
    const [y, m] = input.split("-").map(Number);
    if (m >= 1 && m <= 12) return { y, m: m - 1 };
  }
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() };
}

export default async function PlanningMoisPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { y, m } = resolveMonth(searchParams.month);
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const monthStartIso = toIsoDate(first);

  const [employees, entries] = await Promise.all([
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        weeklyHours: true,
        displayColor: true,
        displayOrder: true,
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        date: {
          gte: new Date(`${monthStartIso}T00:00:00Z`),
          lte: new Date(`${toIsoDate(last)}T00:00:00Z`),
        },
      },
    }),
  ]);

  const initialEntries: ScheduleEntryDTO[] = entries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    date: toIsoDate(e.date),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: e.notes,
  }));

  const employeesDTO: EmployeeDTO[] = employees;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <MonthHeader monthStart={monthStartIso} />

      <MonthOverview
        monthStart={monthStartIso}
        employees={employeesDTO}
        entries={initialEntries}
      />
    </div>
  );
}
