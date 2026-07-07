import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { canEditPlanning } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  isoWeekNumber,
  startOfWeek,
  toIsoDate,
  weekDays,
  weekTypeFor,
} from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";
import { TeamPrintSheet } from "@/components/planning/TeamPrintSheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impression planning équipe · PharmaPlanning" };

/**
 * Version imprimable de la semaine de TOUTE l'équipe (affichage mural, A4
 * paysage). URL : /planning/imprimer?week=YYYY-MM-DD (défaut : semaine courante).
 * Réservé aux rôles qui bâtissent le planning (manageur+).
 */
export default async function PrintTeamPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canEditPlanning(session.user.role)) redirect("/planning");

  const monday = startOfWeek(
    searchParams.week ? new Date(`${searchParams.week}T00:00:00`) : new Date()
  );
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
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { name: true },
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
    <TeamPrintSheet
      pharmacyName={pharmacy?.name ?? "Pharmacie"}
      weekNumber={isoWeekNumber(monday)}
      weekKind={weekTypeFor(monday)}
      dayDates={days.map(toIsoDate)}
      employees={employees}
      entries={entriesDTO}
    />
  );
}
