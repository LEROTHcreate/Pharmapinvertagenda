import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPlanning } from "@/lib/permissions";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { TIME_SLOTS } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("volunteer") }),
  z.object({ action: z.literal("assign"), employeeId: z.string().min(1) }),
  z.object({ action: z.literal("cancel") }),
]);

type Ctx = { params: { id: string } };

/**
 * Actions sur un créneau à couvrir :
 *  - "volunteer" : le collaborateur (avec un profil Employee) se positionne /
 *    se retire (bascule). Autorisé tant que le créneau est OPEN.
 *  - "assign"    : le manageur+ assigne un collaborateur → statut FILLED ; si un
 *    poste est défini et compatible, on écrit directement les créneaux du
 *    planning correspondants.
 *  - "cancel"    : le manageur+ annule le créneau.
 */
async function PATCH__impl(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const shift = await prisma.openShift.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true, status: true, date: true, startSlot: true, endSlot: true, taskCode: true },
  });
  if (!shift) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const body = parsed.data;

  // ── Se positionner / se retirer (collaborateur) ──
  if (body.action === "volunteer") {
    const employeeId = session.user.employeeId;
    if (!employeeId) {
      return NextResponse.json(
        { error: "Ton compte n'est pas rattaché à un profil de l'équipe." },
        { status: 400 }
      );
    }
    if (shift.status !== "OPEN") {
      return NextResponse.json({ error: "Ce créneau n'est plus ouvert." }, { status: 409 });
    }
    const existing = await prisma.openShiftVolunteer.findUnique({
      where: { openShiftId_employeeId: { openShiftId: shift.id, employeeId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.openShiftVolunteer.delete({ where: { id: existing.id } });
    } else {
      await prisma.openShiftVolunteer.create({ data: { openShiftId: shift.id, employeeId } });
    }
    revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));
    return NextResponse.json({ ok: true, volunteering: !existing });
  }

  // ── Actions réservées au manageur+ ──
  if (!canEditPlanning(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (body.action === "cancel") {
    await prisma.openShift.update({
      where: { id: shift.id },
      data: { status: "CANCELLED" },
    });
    revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));
    return NextResponse.json({ ok: true });
  }

  // action === "assign"
  const employee = await prisma.employee.findFirst({
    where: { id: body.employeeId, pharmacyId: session.user.pharmacyId },
    select: { id: true, status: true },
  });
  if (!employee) return NextResponse.json({ error: "collaborateur inconnu" }, { status: 400 });

  await prisma.openShift.update({
    where: { id: shift.id },
    data: { status: "FILLED", assignedEmployeeId: employee.id },
  });

  // Si un poste est défini ET compatible avec le rôle, on écrit directement les
  // créneaux du planning pour le collaborateur assigné (gain de temps admin).
  let wroteEntries = false;
  if (shift.taskCode && isTaskAllowed(employee.status, shift.taskCode)) {
    const slots = TIME_SLOTS.filter((s) => s >= shift.startSlot && s < shift.endSlot);
    if (slots.length > 0) {
      const keys = slots.map((timeSlot) => ({
        employeeId: employee.id,
        date: shift.date,
        timeSlot,
      }));
      await prisma.scheduleEntry.deleteMany({
        where: { pharmacyId: session.user.pharmacyId, OR: keys },
      });
      await prisma.scheduleEntry.createMany({
        data: slots.map((timeSlot) => ({
          pharmacyId: session.user.pharmacyId,
          employeeId: employee.id,
          date: shift.date,
          timeSlot,
          type: "TASK" as const,
          taskCode: shift.taskCode,
        })),
      });
      wroteEntries = true;
    }
  }

  revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));
  return NextResponse.json({ ok: true, wroteEntries });
}

async function DELETE__impl(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditPlanning(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.openShift.deleteMany({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
  });
  revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorHandling(PATCH__impl);
export const DELETE = withErrorHandling(DELETE__impl);
