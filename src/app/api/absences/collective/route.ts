import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createCollectiveAbsenceInput } from "@/validators/absence";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { withErrorHandling } from "@/lib/api-handler";

export const runtime = "nodejs";

// Filet d'erreur global (cold-start BDD → 503). Handler hoisté ci-dessous.
export const POST = withErrorHandling(createCollectiveAbsence);

/**
 * POST /api/absences/collective — absence collective (ADMIN uniquement).
 *
 * Cas d'usage : fermeture de l'officine (jour férié, pont, congés d'été) →
 * marquer toute l'équipe absente sur une plage en un clic, sans saisir chaque
 * collaborateur un par un.
 *
 * Pour chaque collaborateur ciblé :
 *  - crée une AbsenceRequest APPROVED,
 *  - convertit ses ScheduleEntry existants de la plage en ABSENCE, en
 *    mémorisant `previousTaskCode` (comme l'approbation individuelle) pour que
 *    l'annulation ultérieure restaure le planning d'origine.
 *
 * Les créneaux vides ne sont pas créés : on ne marque absent que là où le
 * collaborateur était planifié (cohérent avec l'approbation classique).
 */
async function createCollectiveAbsence(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createCollectiveAbsenceInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const dateStart = new Date(`${parsed.data.dateStart}T00:00:00Z`);
  const dateEnd = new Date(`${parsed.data.dateEnd}T00:00:00Z`);

  // Cible : collaborateurs actifs de la pharmacie (filtrés sur la liste fournie
  // le cas échéant). On ne prend que les fiches de CETTE pharmacie → isolation
  // multi-tenant garantie même si des IDs étrangers sont passés.
  const employees = await prisma.employee.findMany({
    where: {
      pharmacyId: session.user.pharmacyId,
      isActive: true,
      ...(parsed.data.employeeIds
        ? { id: { in: parsed.data.employeeIds } }
        : {}),
    },
    select: { id: true },
  });

  if (employees.length === 0) {
    return NextResponse.json(
      { error: "Aucun collaborateur actif à marquer absent." },
      { status: 400 }
    );
  }

  let createdRequests = 0;
  let convertedSlots = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const emp of employees) {
        await tx.absenceRequest.create({
          data: {
            pharmacyId: session.user.pharmacyId,
            employeeId: emp.id,
            dateStart,
            dateEnd,
            absenceCode: parsed.data.absenceCode,
            reason: parsed.data.reason || null,
            status: "APPROVED",
            reviewedAt: new Date(),
          },
        });

        const existing = await tx.scheduleEntry.findMany({
          where: {
            employeeId: emp.id,
            date: { gte: dateStart, lte: dateEnd },
          },
          select: { id: true, type: true, taskCode: true },
        });
        for (const e of existing) {
          await tx.scheduleEntry.update({
            where: { id: e.id },
            data: {
              type: "ABSENCE",
              taskCode: null,
              absenceCode: parsed.data.absenceCode,
              // Mémorise le poste d'origine seulement si c'était un TASK,
              // pour permettre la restauration à l'annulation.
              previousTaskCode: e.type === "TASK" ? e.taskCode : null,
            },
          });
        }
        createdRequests++;
        convertedSlots += existing.length;
      }
    },
    // Plage potentiellement large × toute l'équipe → on relâche le timeout
    // par défaut (5 s) qui serait trop court pour un long pont sur 20 fiches.
    { timeout: 60_000, maxWait: 15_000 }
  );

  revalidateTag(DASHBOARD_CACHE_TAGS.absencesPending(session.user.pharmacyId));
  // Conversion en masse de cellules planning → invalider le cache planning.
  revalidateTag(DASHBOARD_CACHE_TAGS.planningAll(session.user.pharmacyId));

  return NextResponse.json(
    {
      ok: true,
      employees: createdRequests,
      convertedSlots,
    },
    { status: 201 }
  );
}
