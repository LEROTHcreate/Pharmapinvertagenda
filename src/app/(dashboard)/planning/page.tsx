import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startOfWeek, toIsoDate, weekDays } from "@/lib/planning-utils";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { PlanningView } from "@/components/planning/PlanningView";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

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
      select: { name: true, minStaff: true },
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
    <PlanningView
      initialWeekStart={weekStartIso}
      employees={employeesDTO}
      initialEntries={initialEntries}
      role={session.user.role}
      minStaff={pharmacy?.minStaff ?? 4}
      currentEmployeeId={session.user.employeeId ?? null}
    />
  );
}
