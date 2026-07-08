import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toIsoDate } from "@/lib/planning-utils";
import { parseMetier } from "@/lib/metier-filter";
import { buildMonthPlanningWorkbook } from "@/lib/export-planning-xlsx";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/planning/export-mois?month=YYYY-MM&metier=PHARMACIEN,…
 * Génère le classeur Excel de la vue mois (heures par jour + absences).
 * Accessible à tout utilisateur connecté (données de sa propre officine) ;
 * le filtre métier optionnel restreint aux statuts demandés.
 */
async function GET__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "Paramètre 'month' invalide (YYYY-MM)" },
      { status: 400 }
    );
  }
  const metier = parseMetier(url.searchParams.get("metier"));

  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0));

  const [pharmacy, employeesRaw, entriesRaw] = await Promise.all([
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
        date: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        timeSlot: true,
        type: true,
        taskCode: true,
        absenceCode: true,
        notes: true,
      },
    }),
  ]);

  const employees: EmployeeDTO[] =
    metier.size === 0
      ? employeesRaw
      : employeesRaw.filter((e) => metier.has(e.status));

  const entries: ScheduleEntryDTO[] = entriesRaw.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    date: toIsoDate(e.date),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: e.notes,
  }));

  const buffer = await buildMonthPlanningWorkbook({
    pharmacyName: pharmacy?.name ?? "Pharmacie",
    month,
    employees,
    entries,
  });

  const filename = `planning_${month}.xlsx`;
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

export const GET = withErrorHandling(GET__impl);
