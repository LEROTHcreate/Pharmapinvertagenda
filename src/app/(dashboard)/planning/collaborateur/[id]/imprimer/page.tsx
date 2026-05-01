import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import {
  isoWeekNumber,
  startOfWeek,
  toIsoDate,
  weekDays,
  weekTypeFor,
} from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";
import { SoloPrintSheet } from "@/components/planning/SoloPrintSheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impression · PharmaPlanning" };

/**
 * Version imprimable solo : la semaine d'un seul collaborateur, format A4.
 * URL : /planning/collaborateur/[id]/imprimer?week=YYYY-MM-DD
 *
 * Auto-déclenche le dialog d'impression au chargement (cf. SoloPrintSheet).
 */
export default async function PrintCollaboratorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const collaborator = await prisma.employee.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      weeklyHours: true,
      displayColor: true,
      isActive: true,
    },
  });
  if (!collaborator) notFound();

  // Garde-fou : un EMPLOYEE ne peut imprimer que SA fiche (pas celle d'un collègue)
  if (
    session.user.role !== "ADMIN" &&
    session.user.employeeId !== collaborator.id
  ) {
    redirect("/profil");
  }

  // Semaine ciblée (defaut : courante)
  const monday = startOfWeek(
    searchParams.week ? new Date(`${searchParams.week}T00:00:00`) : new Date()
  );
  const days = weekDays(monday);
  const weekStartIso = toIsoDate(monday);
  const weekEndIso = toIsoDate(days[5]);

  const entries = await prisma.scheduleEntry.findMany({
    where: {
      employeeId: collaborator.id,
      pharmacyId: session.user.pharmacyId,
      date: {
        gte: new Date(`${weekStartIso}T00:00:00Z`),
        lte: new Date(`${weekEndIso}T23:59:59Z`),
      },
    },
  });

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
    <SoloPrintSheet
      collaborator={collaborator}
      weekStart={weekStartIso}
      weekNumber={isoWeekNumber(monday)}
      weekKind={weekTypeFor(monday)}
      dayDates={days.map(toIsoDate)}
      entries={entriesDTO}
      pharmacyName={session.user.name /* fallback, rempli en pharmacy header si besoin */}
    />
  );
}
