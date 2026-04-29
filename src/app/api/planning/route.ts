import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { bulkPlanningInput, weekQuery } from "@/validators/planning";
import { isTaskAllowed } from "@/lib/role-task-rules";
import type { ScheduleEntryDTO } from "@/types";
import { toIsoDate } from "@/lib/planning-utils";

export const runtime = "nodejs";

/** GET /api/planning?weekStart=YYYY-MM-DD — entrées de la semaine */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = weekQuery.safeParse({ weekStart: url.searchParams.get("weekStart") });
  if (!parsed.success) {
    return NextResponse.json({ error: "weekStart invalide" }, { status: 400 });
  }

  const start = new Date(`${parsed.data.weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const entries = await prisma.scheduleEntry.findMany({
    where: {
      pharmacyId: session.user.pharmacyId,
      date: { gte: start, lte: end },
    },
    orderBy: [{ date: "asc" }, { timeSlot: "asc" }],
  });

  const dto: ScheduleEntryDTO[] = entries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    date: toIsoDate(e.date),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: e.notes,
  }));

  return NextResponse.json({ entries: dto });
}

/** POST /api/planning — upsert en bulk (admin) */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bulkPlanningInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const employeeIds = Array.from(new Set(parsed.data.entries.map((e) => e.employeeId)));
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, pharmacyId: session.user.pharmacyId },
    select: { id: true, status: true },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  // Tous les collaborateurs doivent appartenir à la pharmacie de l'admin
  if (empMap.size !== employeeIds.length) {
    return NextResponse.json({ error: "collaborateur inconnu" }, { status: 400 });
  }

  // Vérification rôle/poste
  for (const e of parsed.data.entries) {
    if (e.type === "TASK" && e.taskCode) {
      const emp = empMap.get(e.employeeId)!;
      if (!isTaskAllowed(emp.status, e.taskCode)) {
        return NextResponse.json(
          {
            error: `Le poste ${e.taskCode} n'est pas autorisé pour ce rôle (${emp.status}).`,
          },
          { status: 400 }
        );
      }
    }
  }

  // Upsert en transaction
  await prisma.$transaction(
    parsed.data.entries.map((e) =>
      prisma.scheduleEntry.upsert({
        where: {
          employeeId_date_timeSlot: {
            employeeId: e.employeeId,
            date: new Date(`${e.date}T00:00:00Z`),
            timeSlot: e.timeSlot,
          },
        },
        update: {
          type: e.type,
          taskCode: e.type === "TASK" ? e.taskCode ?? null : null,
          absenceCode: e.type === "ABSENCE" ? e.absenceCode ?? null : null,
          notes: e.notes ?? null,
        },
        create: {
          pharmacyId: session.user.pharmacyId,
          employeeId: e.employeeId,
          date: new Date(`${e.date}T00:00:00Z`),
          timeSlot: e.timeSlot,
          type: e.type,
          taskCode: e.type === "TASK" ? e.taskCode ?? null : null,
          absenceCode: e.type === "ABSENCE" ? e.absenceCode ?? null : null,
          notes: e.notes ?? null,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, count: parsed.data.entries.length });
}

/** DELETE /api/planning?employeeId=X&date=YYYY-MM-DD&timeSlot=HH:MM — efface un créneau */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const employeeId = url.searchParams.get("employeeId");
  const date = url.searchParams.get("date");
  const timeSlot = url.searchParams.get("timeSlot");

  if (!employeeId || !date || !timeSlot) {
    return NextResponse.json({ error: "params manquants" }, { status: 400 });
  }

  // Vérifier que le collaborateur appartient à la pharmacie
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, pharmacyId: session.user.pharmacyId },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.scheduleEntry.deleteMany({
    where: {
      employeeId,
      date: new Date(`${date}T00:00:00Z`),
      timeSlot,
      pharmacyId: session.user.pharmacyId,
    },
  });

  return NextResponse.json({ ok: true });
}
