import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { applyTemplateInput } from "@/validators/template";
import { ScheduleType } from "@prisma/client";
import { isTaskAllowed } from "@/lib/role-task-rules";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/templates/[id]/apply — applique un gabarit à une semaine (admin) */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = applyTemplateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Vérifie l'ownership et récupère les entrées du gabarit
  const template = await prisma.weekTemplate.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    include: { entries: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Gabarit introuvable" }, { status: 404 });
  }

  const monday = new Date(`${parsed.data.weekStart}T00:00:00Z`);
  const weekDates: Date[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d;
  });

  // Si overwrite=true, on efface d'abord les entrées existantes des collaborateurs
  // concernés sur la semaine cible. Bypass pgbouncer pour la perf.
  if (parsed.data.overwrite) {
    const employeeIds = Array.from(
      new Set(template.entries.map((e) => e.employeeId))
    );
    await prismaDirect.scheduleEntry.deleteMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        employeeId: { in: employeeIds },
        date: { gte: weekDates[0], lte: weekDates[5] },
      },
    });
  }

  // Skip silencieusement les collaborateurs inactifs / supprimés depuis création.
  // On garde aussi le statut pour vérifier la compatibilité rôle/poste —
  // un collaborateur peut avoir changé de statut depuis la création du gabarit
  // (ex: préparateur devenu pharmacien) → certains postes du gabarit ne
  // sont alors plus autorisés et doivent être skippés silencieusement.
  const activeEmployees = await prisma.employee.findMany({
    where: { pharmacyId: session.user.pharmacyId, isActive: true },
    select: { id: true, status: true },
  });
  const activeEmpStatus = new Map(
    activeEmployees.map((e) => [e.id, e.status])
  );

  const validEntries: typeof template.entries = [];
  let skippedInactive = 0;
  let skippedIncompatible = 0;
  for (const e of template.entries) {
    const status = activeEmpStatus.get(e.employeeId);
    if (!status) {
      skippedInactive++;
      continue;
    }
    // Pour les TASK, on vérifie la compatibilité avec le statut actuel.
    // Les ABSENCE sont toujours applicables (elles ne sont pas des postes).
    if (
      e.type === ScheduleType.TASK &&
      e.taskCode &&
      !isTaskAllowed(status, e.taskCode)
    ) {
      skippedIncompatible++;
      continue;
    }
    validEntries.push(e);
  }

  const data = validEntries.map((e) => ({
    pharmacyId: session.user.pharmacyId,
    employeeId: e.employeeId,
    date: weekDates[e.dayOfWeek],
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.type === ScheduleType.TASK ? e.taskCode : null,
    absenceCode: e.type === ScheduleType.ABSENCE ? e.absenceCode : null,
  }));

  // Insertion via la connexion directe (bypass pgbouncer) en gros chunks.
  // - overwrite=true → deleteMany fait juste avant, aucun conflit possible
  //   → skipDuplicates inutile (plus rapide).
  // - overwrite=false → la contrainte unique (employeeId, date, timeSlot)
  //   fait que les entrées existantes (modifs manuelles) sont
  //   silencieusement préservées.
  const CHUNK = 8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    await prismaDirect.scheduleEntry.createMany({
      data: data.slice(i, i + CHUNK),
      skipDuplicates: !parsed.data.overwrite,
    });
  }

  return NextResponse.json({
    ok: true,
    applied: data.length,
    skipped: skippedInactive + skippedIncompatible,
    skippedInactive,
    skippedIncompatible,
    templateName: template.name,
  });
}
