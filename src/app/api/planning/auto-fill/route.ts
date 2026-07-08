import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { canApplyTemplates } from "@/lib/permissions";
import { withErrorHandling } from "@/lib/api-handler";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { TIME_SLOTS } from "@/types";
import { parseWeekHours, hasAnyHours } from "@/lib/opening-hours";
import {
  fillComptoirGaps,
  type AutoFillEntry,
  type AutoFillWish,
  type AutoFillAbsence,
} from "@/lib/auto-fill";

export const runtime = "nodejs";
export const POST = withErrorHandling(autoFill);
export const maxDuration = 30;

const bodySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/planning/auto-fill — complète la couverture COMPTOIR de la semaine
 * jusqu'au seuil mini, sur les heures d'ouverture, sans écraser l'existant.
 * (Le bouton client applique d'abord le gabarit de la semaine.)
 */
async function autoFill(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canApplyTemplates(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "weekStart invalide" }, { status: 400 });
  }
  const pharmacyId = session.user.pharmacyId;

  const monday = new Date(`${parsed.data.weekStart}T00:00:00Z`);
  const weekDates = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const weekStartD = new Date(`${weekDates[0]}T00:00:00Z`);
  const weekEndD = new Date(`${weekDates[5]}T23:59:59Z`);

  // 1) « Partir d'un gabarit » : applique le gabarit par DÉFAUT de la semaine
  //    (S1/S2 selon la parité) SANS écraser l'existant, en rappelant la route
  //    apply-batch en interne (cookie retransmis) → zéro duplication de logique.
  const [defS1, defS2] = await Promise.all([
    prisma.weekTemplate.findFirst({
      where: { pharmacyId, weekType: "S1" },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      select: { id: true },
    }),
    prisma.weekTemplate.findFirst({
      where: { pharmacyId, weekType: "S2" },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      select: { id: true },
    }),
  ]);
  let gabaritApplied = false;
  if (defS1 || defS2) {
    const origin = new URL(req.url).origin;
    const applyRes = await fetch(`${origin}/api/templates/apply-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        ...(defS1 ? { s1TemplateId: defS1.id } : {}),
        ...(defS2 ? { s2TemplateId: defS2.id } : {}),
        weekStart: parsed.data.weekStart,
        weeks: 1,
        overwrite: false,
        deleteAbsences: false,
      }),
    }).catch(() => null);
    gabaritApplied = !!applyRes?.ok;
  }

  // 2) Charge l'état (entries FRAÎCHES, après application du gabarit) + réglages.
  const [pharmacy, employees, entries, absences, wishes] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { minStaff: true, openingHours: true },
    }),
    prisma.employee.findMany({
      where: { pharmacyId, isActive: true },
      select: { id: true, status: true, weeklyHours: true },
    }),
    prisma.scheduleEntry.findMany({
      where: { pharmacyId, date: { gte: weekStartD, lte: weekEndD } },
      select: { employeeId: true, date: true, timeSlot: true, type: true, taskCode: true },
    }),
    prisma.absenceRequest.findMany({
      where: {
        pharmacyId,
        status: "APPROVED",
        dateStart: { lte: weekEndD },
        dateEnd: { gte: weekStartD },
      },
      select: { employeeId: true, dateStart: true, dateEnd: true },
    }),
    prisma.availabilityWish.findMany({
      where: { pharmacyId, date: { gte: weekStartD, lte: weekEndD } },
      select: { employeeId: true, date: true, kind: true },
    }),
  ]);

  const openingHours = parseWeekHours(pharmacy?.openingHours ?? null);
  if (!hasAnyHours(openingHours)) {
    return NextResponse.json(
      {
        error: "no_hours",
        message:
          "Renseigne d'abord les horaires d'ouverture dans Paramètres pour utiliser le remplissage automatique.",
      },
      { status: 400 }
    );
  }

  const existing: AutoFillEntry[] = entries.map((e) => ({
    employeeId: e.employeeId,
    date: e.date.toISOString().slice(0, 10),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
  }));
  const absenceInput: AutoFillAbsence[] = absences.map((a) => ({
    employeeId: a.employeeId,
    startIso: a.dateStart.toISOString().slice(0, 10),
    endIso: a.dateEnd.toISOString().slice(0, 10),
  }));
  const wishInput: AutoFillWish[] = wishes.map((w) => ({
    employeeId: w.employeeId,
    date: w.date.toISOString().slice(0, 10),
    kind: w.kind,
  }));

  const rows = fillComptoirGaps({
    weekDates,
    timeSlots: TIME_SLOTS,
    openingHours,
    minStaff: pharmacy?.minStaff ?? 4,
    employees,
    existing,
    wishes: wishInput,
    absences: absenceInput,
  });

  if (rows.length > 0) {
    await prismaDirect.scheduleEntry.createMany({
      data: rows.map((r) => ({
        pharmacyId,
        employeeId: r.employeeId,
        date: new Date(`${r.date}T00:00:00Z`),
        timeSlot: r.timeSlot,
        type: "TASK" as const,
        taskCode: "COMPTOIR" as const,
        absenceCode: null,
      })),
      skipDuplicates: true, // garde-fou : ne réécrit jamais une case existante
    });
    revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(pharmacyId));
  }

  return NextResponse.json({ ok: true, added: rows.length, gabaritApplied });
}
