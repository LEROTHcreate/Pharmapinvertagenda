import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { startOfWeek, toIsoDate, weekDays } from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";
import { CollaboratorView } from "@/components/planning/CollaboratorView";

export const dynamic = "force-dynamic";

type SearchParams = {
  view?: "week" | "month";
  week?: string;  // YYYY-MM-DD du lundi
  month?: string; // YYYY-MM
};

export default async function CollaboratorPlanningPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Récupère le collaborateur (scopé à la pharmacie de l'utilisateur)
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

  const view = searchParams.view === "month" ? "month" : "week";

  // ─── Calcul de la plage selon la vue ────────────────────────────
  let rangeStart: Date;
  let rangeEnd: Date; // exclusive
  let weekStartIso: string | null = null;
  let monthIso: string | null = null;

  if (view === "month") {
    const now = new Date();
    const param = searchParams.month?.match(/^(\d{4})-(\d{2})$/);
    const year = param ? Number(param[1]) : now.getUTCFullYear();
    const monthIdx = param ? Number(param[2]) - 1 : now.getUTCMonth();
    rangeStart = new Date(Date.UTC(year, monthIdx, 1));
    rangeEnd = new Date(Date.UTC(year, monthIdx + 1, 1));
    monthIso = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
  } else {
    const baseDate = searchParams.week
      ? new Date(`${searchParams.week}T00:00:00`)
      : new Date();
    if (Number.isNaN(baseDate.getTime())) redirect(`/planning/collaborateur/${params.id}`);
    const monday = startOfWeek(baseDate);
    const days = weekDays(monday);
    rangeStart = new Date(`${toIsoDate(monday)}T00:00:00Z`);
    rangeEnd = new Date(`${toIsoDate(days[5])}T23:59:59Z`);
    weekStartIso = toIsoDate(monday);
  }

  const entries = await prisma.scheduleEntry.findMany({
    where: {
      employeeId: collaborator.id,
      date: { gte: rangeStart, lte: rangeEnd },
    },
    orderBy: [{ date: "asc" }, { timeSlot: "asc" }],
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
    <CollaboratorView
      collaborator={collaborator}
      entries={entriesDTO}
      view={view}
      weekStart={weekStartIso}
      month={monthIso}
    />
  );
}
