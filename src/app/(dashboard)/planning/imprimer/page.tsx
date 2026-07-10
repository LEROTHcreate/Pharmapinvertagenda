import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  isoWeekNumber,
  startOfWeek,
  toIsoDate,
  weekDays,
  weekTypeFor,
} from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";
import { TeamWeekPrintSheet } from "@/components/planning/TeamWeekPrintSheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impression équipe · PharmaPlanning" };

/**
 * Version imprimable ÉQUIPE de la semaine (A4 paysage) — collaborateurs en
 * lignes, jours en colonnes, plages horaires dans les cases. Pour l'affichage
 * en back-office. URL : /planning/imprimer?week=YYYY-MM-DD
 */
export default async function PrintTeamPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const monday = startOfWeek(
    searchParams.week ? new Date(`${searchParams.week}T00:00:00`) : new Date()
  );
  const days = weekDays(monday);
  const weekStartIso = toIsoDate(monday);
  const weekEndIso = toIsoDate(days[5]);

  const [pharmacy, employees, entries] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { name: true, minStaff: true },
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
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        date: {
          gte: new Date(`${weekStartIso}T00:00:00Z`),
          lte: new Date(`${weekEndIso}T23:59:59Z`),
        },
      },
    }),
  ]);

  const entriesDTO: ScheduleEntryDTO[] = entries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    date: toIsoDate(e.date),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: e.notes,
  }));

  return (
    <TeamWeekPrintSheet
      pharmacyName={pharmacy?.name ?? "Pharmacie"}
      weekNumber={isoWeekNumber(monday)}
      weekKind={weekTypeFor(monday)}
      dayDates={days.map(toIsoDate)}
      employees={employees}
      entries={entriesDTO}
      minStaff={pharmacy?.minStaff ?? 4}
    />
  );
}
