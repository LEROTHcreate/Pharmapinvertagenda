import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPlanning } from "@/lib/permissions";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { TIME_SLOTS } from "@/types";
import { toIsoDate } from "@/lib/planning-utils";
import type { TaskCode } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOT = z.enum(TIME_SLOTS as [string, ...string[]]);

const createSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startSlot: SLOT, // début = un créneau réel de la grille (07:30–19:30)
    endSlot: z.string().regex(/^\d{2}:\d{2}$/), // fin exclusive, jusqu'à 20:00
    taskCode: z.string().nullish(),
    note: z.string().max(280).nullish(),
  })
  .refine((v) => v.startSlot < v.endSlot, {
    message: "L'heure de fin doit être après le début.",
  });

/**
 * Créneaux à couvrir. GET : liste des créneaux à venir (tous les utilisateurs).
 * POST : crée un créneau à pourvoir (manageur+).
 */
async function GET__impl() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const canManage = canEditPlanning(session.user.role);
  const myEmployeeId = session.user.employeeId ?? null;
  const todayIso = toIsoDate(new Date());
  const shifts = await prisma.openShift.findMany({
    where: {
      pharmacyId: session.user.pharmacyId,
      // On garde les créneaux d'aujourd'hui et à venir (les passés non pourvus
      // n'ont plus d'intérêt à s'afficher).
      date: { gte: new Date(`${todayIso}T00:00:00.000Z`) },
    },
    orderBy: [{ date: "asc" }, { startSlot: "asc" }],
    include: {
      assignedEmployee: { select: { id: true, firstName: true, lastName: true, displayColor: true } },
      volunteers: {
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, displayColor: true } },
        },
      },
    },
  });

  // Qui travaille (a un poste) sur les dates concernées → sert à l'éligibilité :
  // seuls ceux qui NE travaillent PAS ce jour-là peuvent se positionner.
  const shiftDates = Array.from(new Set(shifts.map((s) => s.date.getTime()))).map((t) => new Date(t));
  const worksByDate = new Map<string, Set<string>>(); // isoDate → employeeIds qui bossent
  if (shiftDates.length > 0) {
    const workEntries = await prisma.scheduleEntry.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        type: "TASK",
        date: { in: shiftDates },
      },
      select: { employeeId: true, date: true },
    });
    for (const e of workEntries) {
      const iso = toIsoDate(e.date);
      const set = worksByDate.get(iso) ?? new Set<string>();
      set.add(e.employeeId);
      worksByDate.set(iso, set);
    }
  }

  return NextResponse.json({
    shifts: shifts.map((s) => {
      const iso = toIsoDate(s.date);
      const workers = worksByDate.get(iso) ?? new Set<string>();
      return {
        id: s.id,
        date: iso,
        startSlot: s.startSlot,
        endSlot: s.endSlot,
        taskCode: s.taskCode,
        note: s.note,
        status: s.status,
        assignedEmployee: s.assignedEmployee,
        volunteers: s.volunteers.map((v) => v.employee),
        // Le collaborateur courant travaille-t-il déjà ce jour-là ?
        iWorkThatDay: myEmployeeId ? workers.has(myEmployeeId) : false,
        // Pour le menu d'assignation (responsables) : qui bosse déjà ce jour-là.
        workingEmployeeIds: canManage ? [...workers] : null,
      };
    }),
  });
}

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditPlanning(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides" },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const created = await prisma.openShift.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      date: new Date(`${d.date}T00:00:00.000Z`),
      startSlot: d.startSlot,
      endSlot: d.endSlot,
      taskCode: (d.taskCode as TaskCode | null) ?? null,
      note: d.note?.trim() || null,
      createdById: session.user.id,
    },
    select: { id: true },
  });

  revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));
  return NextResponse.json({ ok: true, id: created.id });
}

export const GET = withErrorHandling(GET__impl);
export const POST = withErrorHandling(POST__impl);
