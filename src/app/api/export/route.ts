import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startOfWeek, toIsoDate, weekDays } from "@/lib/planning-utils";
import { buildPlanningWorkbook } from "@/lib/export-xlsx";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/export?weekStart=YYYY-MM-DD
 * Génère un .xlsx du planning de la semaine pour la pharmacie de l'utilisateur.
 * Format réservé aux admins (l'export contient toutes les données équipe).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const weekStartParam = url.searchParams.get("weekStart");
  const baseDate = weekStartParam
    ? new Date(`${weekStartParam}T00:00:00`)
    : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return NextResponse.json(
      { error: "weekStart invalide (YYYY-MM-DD attendu)" },
      { status: 400 }
    );
  }
  const monday = startOfWeek(baseDate);
  const days = weekDays(monday);
  const weekStartIso = toIsoDate(monday);
  const weekEndIso = toIsoDate(days[5]);

  const [pharmacy, employees, entries] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { name: true },
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
  ]);

  const employeesDTO: EmployeeDTO[] = employees;
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

  const buffer = await buildPlanningWorkbook({
    pharmacyName: pharmacy?.name ?? "Pharmacie",
    weekStart: monday,
    employees: employeesDTO,
    entries: entriesDTO,
  });

  const filename = `planning_${weekStartIso}.xlsx`;
  // NextResponse n'accepte pas directement un Buffer côté types — on passe
  // par un Uint8Array (BodyInit valide) qui est juste une vue sur les mêmes octets.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
