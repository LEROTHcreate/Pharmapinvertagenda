import { NextResponse } from "next/server";
import { revalidateTag, unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { bulkPlanningInput, weekQuery } from "@/validators/planning";
import { isTaskAllowed } from "@/lib/role-task-rules";
import type { ScheduleEntryDTO } from "@/types";
import { toIsoDate } from "@/lib/planning-utils";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

export const runtime = "nodejs";

/** Lecture cached du planning d'une semaine. Invalidée sur POST/DELETE. */
const getCachedPlanning = (pharmacyId: string, weekStart: string) =>
  unstable_cache(
    async () => {
      const start = new Date(`${weekStart}T00:00:00Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return prisma.scheduleEntry.findMany({
        where: { pharmacyId, date: { gte: start, lte: end } },
        orderBy: [{ date: "asc" }, { timeSlot: "asc" }],
      });
    },
    ["planning-week", pharmacyId, weekStart],
    {
      // Double tag : invalidation fine (par semaine) ET globale
      // (toutes les semaines de la pharmacie, ex. après apply-batch).
      tags: [
        DASHBOARD_CACHE_TAGS.planningWeek(pharmacyId, weekStart),
        DASHBOARD_CACHE_TAGS.planningAll(pharmacyId),
      ],
      // Le planning change pendant les sessions admin → court TTL
      // (10 sec) en complément de l'invalidation explicite par tag.
      revalidate: 10,
    }
  )();

/** GET /api/planning?weekStart=YYYY-MM-DD — entrées de la semaine */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = weekQuery.safeParse({ weekStart: url.searchParams.get("weekStart") });
  if (!parsed.success) {
    return NextResponse.json({ error: "weekStart invalide" }, { status: 400 });
  }

  const entries = await getCachedPlanning(
    session.user.pharmacyId,
    parsed.data.weekStart
  );

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

  // ─── Détection des conflits avec des absences APPROUVÉES ──────────────
  // Si l'admin tente d'écrire un TASK sur un (employeeId, date) couvert par
  // une AbsenceRequest APPROVED, on retourne 409 sauf si `force: true` est
  // explicitement envoyé. Ça évite d'écraser silencieusement un congé déjà
  // validé.
  const taskEntries = parsed.data.entries.filter((e) => e.type === "TASK");
  const conflicts: Array<{
    employeeId: string;
    employeeName: string;
    date: string;
    timeSlot: string;
    absenceCode: string;
  }> = [];
  if (taskEntries.length > 0) {
    const empIds = Array.from(new Set(taskEntries.map((e) => e.employeeId)));
    const dates = Array.from(new Set(taskEntries.map((e) => e.date)));
    const minDate = new Date(`${dates.reduce((a, b) => (a < b ? a : b))}T00:00:00Z`);
    const maxDate = new Date(`${dates.reduce((a, b) => (a > b ? a : b))}T00:00:00Z`);

    const absences = await prisma.absenceRequest.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        employeeId: { in: empIds },
        status: "APPROVED",
        // Toute absence dont la plage chevauche au moins une des dates ciblées
        dateStart: { lte: maxDate },
        dateEnd: { gte: minDate },
      },
      select: {
        employeeId: true,
        dateStart: true,
        dateEnd: true,
        absenceCode: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    for (const e of taskEntries) {
      const targetDate = new Date(`${e.date}T00:00:00Z`);
      const match = absences.find(
        (a) =>
          a.employeeId === e.employeeId &&
          a.dateStart <= targetDate &&
          a.dateEnd >= targetDate
      );
      if (match) {
        conflicts.push({
          employeeId: e.employeeId,
          employeeName:
            `${match.employee.firstName} ${match.employee.lastName}`.trim(),
          date: e.date,
          timeSlot: e.timeSlot,
          absenceCode: match.absenceCode,
        });
      }
    }

    if (conflicts.length > 0 && !parsed.data.force) {
      return NextResponse.json(
        {
          error: "ABSENCE_CONFLICT",
          conflicts,
        },
        { status: 409 }
      );
    }
  }

  // ─── Bulk upsert : delete + createMany (2 round-trips fixes) ───────
  // Avant : `prisma.$transaction([upsert × N])` = N round-trips séquentiels.
  // Pour un drag-select de 30 cellules + latence transatlantique (~150ms),
  // ça donne 4.5s d'attente perçue.
  //
  // Maintenant : deleteMany (1 RT) + createMany (1 RT) = ~300ms total quel
  // que soit le nombre de cellules. Pas besoin de transaction explicite :
  // delete puis insert sur les MÊMES clés (employeeId, date, timeSlot) est
  // équivalent à un upsert et ne peut pas créer d'incohérence (la contrainte
  // unique nous protège).
  const keys = parsed.data.entries.map((e) => ({
    employeeId: e.employeeId,
    date: new Date(`${e.date}T00:00:00Z`),
    timeSlot: e.timeSlot,
  }));

  await prismaDirect.scheduleEntry.deleteMany({
    where: {
      pharmacyId: session.user.pharmacyId,
      OR: keys,
    },
  });

  await prismaDirect.scheduleEntry.createMany({
    data: parsed.data.entries.map((e) => ({
      pharmacyId: session.user.pharmacyId,
      employeeId: e.employeeId,
      date: new Date(`${e.date}T00:00:00Z`),
      timeSlot: e.timeSlot,
      type: e.type,
      taskCode: e.type === "TASK" ? e.taskCode ?? null : null,
      absenceCode: e.type === "ABSENCE" ? e.absenceCode ?? null : null,
      notes: e.notes ?? null,
    })),
    skipDuplicates: false,
  });

  // Invalide le cache de toutes les semaines de la pharmacie. On utilise
  // le tag global plutôt que d'extraire les semaines précises depuis
  // entries — c'est plus simple et la perf est bonne (re-cache au
  // prochain GET, ~30ms en local).
  revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));

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

  revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));
  return NextResponse.json({ ok: true });
}
