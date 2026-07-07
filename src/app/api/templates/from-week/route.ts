import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { canApplyTemplates } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { templateFromWeekInput } from "@/validators/template";
import { isoWeekStartUTC } from "@/lib/work-hours";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/templates/from-week — crée un gabarit À PARTIR d'une semaine réelle
 * du planning (miroir de l'application). On lit tous les créneaux de la semaine
 * ciblée et on les fige en gabarit (date → jour de la semaine 0-5).
 */
async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canApplyTemplates(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = templateFromWeekInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Lundi ISO de la semaine ciblée (la date fournie peut être n'importe quel
  // jour de la semaine).
  const monday = isoWeekStartUTC(new Date(`${parsed.data.weekStart}T00:00:00Z`));
  const weekDates: Date[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d;
  });

  const entries = await prisma.scheduleEntry.findMany({
    where: {
      pharmacyId: session.user.pharmacyId,
      date: { gte: weekDates[0], lte: weekDates[5] },
    },
    select: {
      employeeId: true,
      date: true,
      timeSlot: true,
      type: true,
      taskCode: true,
      absenceCode: true,
    },
  });

  const category =
    parsed.data.category && parsed.data.category.length > 0
      ? parsed.data.category
      : null;
  const description =
    parsed.data.description && parsed.data.description.length > 0
      ? parsed.data.description
      : null;

  const created = await prisma.weekTemplate.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      weekType: parsed.data.weekType,
      name: parsed.data.name,
      category,
      description,
    },
    select: { id: true },
  });

  // Mappe chaque créneau (date absolue) → jour de la semaine (0=lundi .. 5=sam).
  const mondayTime = monday.getTime();
  const rows = entries
    .map((e) => ({
      templateId: created.id,
      employeeId: e.employeeId,
      dayOfWeek: Math.round((e.date.getTime() - mondayTime) / 86400000),
      timeSlot: e.timeSlot,
      type: e.type,
      taskCode: e.taskCode,
      absenceCode: e.absenceCode,
    }))
    .filter((r) => r.dayOfWeek >= 0 && r.dayOfWeek <= 5);

  if (rows.length > 0) {
    const CHUNK = 8000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prismaDirect.weekTemplateEntry.createMany({
        data: rows.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
    }
  }

  revalidateTag(DASHBOARD_CACHE_TAGS.templatesList(session.user.pharmacyId));

  return NextResponse.json({
    ok: true,
    id: created.id,
    entryCount: rows.length,
  });
}

export const POST = withErrorHandling(POST__impl);
