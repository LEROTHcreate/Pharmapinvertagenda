import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  startOfWeek,
  toIsoDate,
  weekDays,
} from "@/lib/planning-utils";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { PlanningHeader } from "@/components/planning/PlanningHeader";
import { WeekOverview } from "@/components/planning/WeekOverview";

export const metadata = { title: "Vue semaine · PharmaPlanning" };

export default async function PlanningSemainePage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const initialWeekStart = searchParams.week
    ? new Date(`${searchParams.week}T00:00:00`)
    : startOfWeek(new Date());
  const monday = startOfWeek(initialWeekStart);
  const days = weekDays(monday);
  const weekStartIso = toIsoDate(monday);
  const weekEndIso = toIsoDate(days[5]);

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
        displayColor: true,
        displayOrder: true,
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        date: {
          gte: new Date(`${weekStartIso}T00:00:00Z`),
          lte: new Date(`${weekEndIso}T00:00:00Z`),
        },
      },
    }),
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { minStaff: true },
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
  const subtitle = `Du ${days[0].toLocaleDateString("fr-FR")} au ${days[5].toLocaleDateString(
    "fr-FR"
  )}`;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PlanningHeader
        weekStart={weekStartIso}
        mode="week"
        basePath="/planning/semaine"
        title="Vue semaine"
        subtitle={subtitle}
      />

      <WeekOverview
        weekStart={weekStartIso}
        employees={employeesDTO}
        entries={initialEntries}
        minStaff={pharmacy?.minStaff ?? 4}
      />
    </div>
  );
}
