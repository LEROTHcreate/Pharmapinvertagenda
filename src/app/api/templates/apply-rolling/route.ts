import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { ScheduleType, type WeekType } from "@prisma/client";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

export const runtime = "nodejs";
// Bulk de 26 semaines × 1000+ entries peut prendre ~5-10s
export const maxDuration = 60;

const inputSchema = z.object({
  /** Lundi de la 1re semaine cible (ISO YYYY-MM-DD) */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Nombre de semaines à remplir (entre 1 et 52) */
  weeks: z.number().int().min(1).max(52),
  /** Type de la 1re semaine — alterne ensuite automatiquement */
  startWeekType: z.enum(["S1", "S2"]),
  /** Si true, écrase les créneaux existants ; sinon préserve les modifs manuelles */
  overwrite: z.boolean().default(false),
});

/**
 * POST /api/templates/apply-rolling
 *
 * Applique les gabarits S1/S2 en alternance sur N semaines consécutives.
 * - Si seul S1 (ou seul S2) existe → applique le même chaque semaine.
 * - Si les 2 existent → alterne S1, S2, S1, S2... à partir de `startWeekType`.
 * - Pour chaque type, on prend le gabarit le plus récent de la pharmacie.
 *
 * Admin uniquement. Réutilise la logique de validation rôle/poste.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "payload invalide" }, { status: 400 });
  }
  const { weekStart, weeks, startWeekType, overwrite } = parsed.data;
  const pharmacyId: string = session.user.pharmacyId; // capture pour les closures

  // Récupère le dernier gabarit de chaque type pour la pharmacie
  const allTemplates = await prisma.weekTemplate.findMany({
    where: { pharmacyId: pharmacyId, isActive: true },
    include: { entries: true },
    orderBy: { createdAt: "desc" },
  });
  const latestByType = new Map<WeekType, (typeof allTemplates)[number]>();
  for (const t of allTemplates) {
    if (!latestByType.has(t.weekType)) latestByType.set(t.weekType, t);
  }

  const tplStart = latestByType.get(startWeekType);
  const tplOther = latestByType.get(startWeekType === "S1" ? "S2" : "S1");

  if (!tplStart && !tplOther) {
    return NextResponse.json(
      { error: "Aucun gabarit défini — crée S1 ou S2 d'abord." },
      { status: 404 }
    );
  }

  // Statuts actifs pour validation rôle/poste
  const activeEmployees = await prisma.employee.findMany({
    where: { pharmacyId: pharmacyId, isActive: true },
    select: { id: true, status: true },
  });
  const activeEmpStatus = new Map(
    activeEmployees.map((e) => [e.id, e.status])
  );

  type TemplateEntry = (typeof allTemplates)[number]["entries"][number];

  /** Génère les ScheduleEntry valides pour un gabarit appliqué à une semaine */
  function buildEntries(
    template: (typeof allTemplates)[number],
    monday: Date
  ): {
    rows: {
      pharmacyId: string;
      employeeId: string;
      date: Date;
      timeSlot: string;
      type: ScheduleType;
      taskCode: TemplateEntry["taskCode"];
      absenceCode: TemplateEntry["absenceCode"];
    }[];
    skipped: number;
  } {
    const weekDates: Date[] = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return d;
    });
    const rows = [];
    let skipped = 0;
    for (const e of template.entries) {
      const status = activeEmpStatus.get(e.employeeId);
      if (!status) {
        skipped++;
        continue;
      }
      if (
        e.type === ScheduleType.TASK &&
        e.taskCode &&
        !isTaskAllowed(status, e.taskCode)
      ) {
        skipped++;
        continue;
      }
      rows.push({
        pharmacyId: pharmacyId,
        employeeId: e.employeeId,
        date: weekDates[e.dayOfWeek],
        timeSlot: e.timeSlot,
        type: e.type,
        taskCode: e.type === ScheduleType.TASK ? e.taskCode : null,
        absenceCode: e.type === ScheduleType.ABSENCE ? e.absenceCode : null,
      });
    }
    return { rows, skipped };
  }

  const startMonday = new Date(`${weekStart}T00:00:00Z`);
  let totalSkipped = 0;
  const breakdown: Array<{ weekStart: string; weekType: WeekType; applied: number }> = [];

  // ─── 1) Construit le batch complet en mémoire (pas de I/O) ────────────
  // Avant : pour chaque semaine, on faisait deleteMany + createMany OU
  // une transaction de N upserts. Avec 26 semaines × 1000 entries, ça
  // donnait jusqu'à 26 000 round-trips séquentiels = > 1 min en local.
  //
  // Maintenant : on calcule TOUS les rows d'abord, puis 2 round-trips
  // au total (deleteMany global + createMany global avec chunks).
  type Row = ReturnType<typeof buildEntries>["rows"][number];
  const allRows: Row[] = [];
  let lastWeekMonday = startMonday;

  for (let w = 0; w < weeks; w++) {
    const weekMonday = new Date(startMonday);
    weekMonday.setUTCDate(startMonday.getUTCDate() + w * 7);
    const weekIso = weekMonday.toISOString().slice(0, 10);
    lastWeekMonday = weekMonday;

    const expectedType: WeekType =
      w % 2 === 0
        ? startWeekType
        : startWeekType === "S1"
          ? "S2"
          : "S1";

    const tpl =
      latestByType.get(expectedType) ??
      latestByType.get(expectedType === "S1" ? "S2" : "S1");
    if (!tpl) continue;

    const { rows, skipped } = buildEntries(tpl, weekMonday);
    totalSkipped += skipped;
    allRows.push(...rows);
    breakdown.push({
      weekStart: weekIso,
      weekType: tpl.weekType,
      applied: rows.length,
    });
  }

  // ─── 2) DB : opérations bulk via la connexion DIRECTE (bypass pgbouncer)
  // pgbouncer en mode transaction (port 6543) tue la perf des inserts en
  // masse. Le client `prismaDirect` parle directement à Postgres
  // (port 5432) et règle ce problème (cf. apply-batch).
  if (overwrite && allRows.length > 0) {
    const empIds = Array.from(new Set(allRows.map((r) => r.employeeId)));
    const lastSat = new Date(lastWeekMonday);
    lastSat.setUTCDate(lastWeekMonday.getUTCDate() + 5);
    console.time(`[apply-rolling] deleteMany`);
    await prismaDirect.scheduleEntry.deleteMany({
      where: {
        pharmacyId,
        employeeId: { in: empIds },
        date: { gte: startMonday, lte: lastSat },
      },
    });
    console.timeEnd(`[apply-rolling] deleteMany`);
  }

  // createMany en chunks de 8000 (limite Postgres : 65535 params / 7 cols
  // = 9362 max). Si overwrite=true, le deleteMany précédent garantit
  // qu'aucun conflit ne reste → skipDuplicates inutile (plus rapide).
  console.time(`[apply-rolling] insert ${allRows.length} rows`);
  const CHUNK = 8000;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const chunk = allRows.slice(i, i + CHUNK);
    const label = `[apply-rolling] chunk ${Math.floor(i / CHUNK) + 1} (${chunk.length} rows)`;
    console.time(label);
    await prismaDirect.scheduleEntry.createMany({
      data: chunk,
      skipDuplicates: !overwrite,
    });
    console.timeEnd(label);
  }
  console.timeEnd(`[apply-rolling] insert ${allRows.length} rows`);

  revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(pharmacyId));

  return NextResponse.json({
    ok: true,
    weeks,
    applied: allRows.length,
    skipped: totalSkipped,
    breakdown,
  });
}
