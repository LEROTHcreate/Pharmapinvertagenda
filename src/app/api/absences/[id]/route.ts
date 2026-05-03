import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewAbsenceInput } from "@/validators/absence";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import {
  sendAbsenceApprovedEmail,
  sendAbsenceRejectedEmail,
} from "@/lib/email";
import { ABSENCE_LABELS } from "@/types";

export const runtime = "nodejs";

/**
 * PATCH /api/absences/[id] — admin valide ou refuse une demande.
 * Si APPROVE : tous les `ScheduleEntry` existants de le collaborateur dans la plage
 * sont convertis en ABSENCE (taskCode null, absenceCode du request). Les
 * créneaux vides ne sont pas créés (le collaborateur n'était pas planifié dessus).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Seul un TITULAIRE peut accepter/refuser les demandes d'absence.
  // Un admin pharmacien ou autre ne peut pas valider — c'est une prérogative
  // du dirigeant uniquement.
  if (!session.user.employeeId) {
    return NextResponse.json(
      { error: "Seul un titulaire peut valider une demande d'absence." },
      { status: 403 }
    );
  }
  const reviewerEmployee = await prisma.employee.findUnique({
    where: { id: session.user.employeeId },
    select: { status: true },
  });
  if (!reviewerEmployee || reviewerEmployee.status !== "TITULAIRE") {
    return NextResponse.json(
      { error: "Seul un titulaire peut valider une demande d'absence." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = reviewAbsenceInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const request = await prisma.absenceRequest.findUnique({
    where: { id: params.id },
  });
  if (!request || request.pharmacyId !== session.user.pharmacyId) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (request.status !== "PENDING") {
    return NextResponse.json(
      { error: "Cette demande a déjà été traitée" },
      { status: 409 }
    );
  }

  const { decision, adminNote } = parsed.data;

  // Récupère les infos collaborateur/email pour la notification email
  const employeeWithUser = await prisma.employee.findUnique({
    where: { id: request.employeeId },
    select: {
      firstName: true,
      lastName: true,
      user: { select: { email: true } },
    },
  });

  if (decision === "REJECT") {
    await prisma.absenceRequest.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        adminNote: adminNote || null,
        reviewedAt: new Date(),
      },
    });
    revalidateTag(DASHBOARD_CACHE_TAGS.absencesPending(session.user.pharmacyId));

    // Email à le collaborateur (best-effort)
    if (employeeWithUser?.user?.email) {
      void sendAbsenceRejectedEmail({
        to: employeeWithUser.user.email,
        employeeName: `${employeeWithUser.firstName} ${employeeWithUser.lastName}`.trim(),
        absenceLabel: ABSENCE_LABELS[request.absenceCode],
        dateStart: request.dateStart.toISOString().slice(0, 10),
        dateEnd: request.dateEnd.toISOString().slice(0, 10),
        adminNote: adminNote || null,
      });
    }

    return NextResponse.json({ status: "REJECTED" });
  }

  // APPROVE → maj du statut + transformation des créneaux planning concernés.
  // Pour chaque cellule TASK convertie en ABSENCE, on sauvegarde son
  // taskCode d'origine dans `previousTaskCode` → permet de restaurer le
  // planning si l'admin annule l'absence après coup.
  let convertedCount = 0;
  await prisma.$transaction(async (tx) => {
    // Récupère taskCode + type pour pouvoir mémoriser le previous
    const existing = await tx.scheduleEntry.findMany({
      where: {
        employeeId: request.employeeId,
        date: { gte: request.dateStart, lte: request.dateEnd },
      },
      select: { id: true, type: true, taskCode: true },
    });
    // 1 update par entrée — on ne peut pas faire un updateMany ici car
    // chaque cellule a son propre previousTaskCode. Pour une plage typique
    // (1 sem × 14 créneaux/jour = 84 cellules max), ça reste raisonnable.
    for (const e of existing) {
      await tx.scheduleEntry.update({
        where: { id: e.id },
        data: {
          type: "ABSENCE",
          taskCode: null,
          absenceCode: request.absenceCode,
          // Sauvegarde du poste d'origine uniquement s'il y avait un TASK
          // (pas pour une absence remplacée par une autre absence).
          previousTaskCode: e.type === "TASK" ? e.taskCode : null,
        },
      });
    }
    convertedCount = existing.length;

    await tx.absenceRequest.update({
      where: { id: params.id },
      data: {
        status: "APPROVED",
        adminNote: adminNote || null,
        reviewedAt: new Date(),
      },
    });
  });
  revalidateTag(DASHBOARD_CACHE_TAGS.absencesPending(session.user.pharmacyId));

  // Email à le collaborateur (best-effort)
  if (employeeWithUser?.user?.email) {
    void sendAbsenceApprovedEmail({
      to: employeeWithUser.user.email,
      employeeName: `${employeeWithUser.firstName} ${employeeWithUser.lastName}`.trim(),
      absenceLabel: ABSENCE_LABELS[request.absenceCode],
      dateStart: request.dateStart.toISOString().slice(0, 10),
      dateEnd: request.dateEnd.toISOString().slice(0, 10),
      adminNote: adminNote || null,
    });
  }

  return NextResponse.json({
    status: "APPROVED",
    convertedSlots: convertedCount,
  });
}

/**
 * DELETE /api/absences/[id] — annulation d'une demande d'absence.
 *
 *  - PENDING : annulable par le demandeur OU par un admin → simple delete.
 *  - APPROVED : annulable UNIQUEMENT par un admin (l'admin reconnaît qu'il
 *    a validé par erreur). Restaure les créneaux planning qui avaient été
 *    convertis (utilise `previousTaskCode` mémorisé à l'approbation).
 *  - REJECTED : non annulable (sans intérêt, c'est juste de l'historique).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const request = await prisma.absenceRequest.findUnique({
    where: { id: params.id },
  });
  if (!request || request.pharmacyId !== session.user.pharmacyId) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const isOwner = request.employeeId === session.user.employeeId;

  if (request.status === "PENDING") {
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    await prisma.absenceRequest.delete({ where: { id: params.id } });
    revalidateTag(DASHBOARD_CACHE_TAGS.absencesPending(session.user.pharmacyId));
    return NextResponse.json({ ok: true, restored: 0 });
  }

  if (request.status === "APPROVED") {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Seul un admin peut annuler une absence approuvée." },
        { status: 403 }
      );
    }
    // Restaure les créneaux planning + supprime la demande, dans une transaction.
    let restoredCount = 0;
    let clearedCount = 0;
    await prisma.$transaction(async (tx) => {
      // Cible : entrées ABSENCE de ce collaborateur dans la plage, dont
      // l'absenceCode correspond toujours à celui de la demande (= pas
      // modifiées depuis par une autre absence).
      const candidates = await tx.scheduleEntry.findMany({
        where: {
          employeeId: request.employeeId,
          date: { gte: request.dateStart, lte: request.dateEnd },
          type: "ABSENCE",
          absenceCode: request.absenceCode,
        },
        select: { id: true, previousTaskCode: true },
      });
      for (const e of candidates) {
        if (e.previousTaskCode) {
          // Cellule qui était une TASK avant l'approbation → restauration
          await tx.scheduleEntry.update({
            where: { id: e.id },
            data: {
              type: "TASK",
              taskCode: e.previousTaskCode,
              absenceCode: null,
              previousTaskCode: null,
            },
          });
          restoredCount++;
        } else {
          // Cellule qui était vide ou autre absence avant → supprime l'entrée
          // (sinon on aurait une cellule "ABSENCE orpheline" sans demande)
          await tx.scheduleEntry.delete({ where: { id: e.id } });
          clearedCount++;
        }
      }
      await tx.absenceRequest.delete({ where: { id: params.id } });
    });
    revalidateTag(DASHBOARD_CACHE_TAGS.absencesPending(session.user.pharmacyId));

    return NextResponse.json({
      ok: true,
      restored: restoredCount,
      cleared: clearedCount,
    });
  }

  // REJECTED ou autre — pas annulable
  return NextResponse.json(
    { error: "Demande déjà refusée — impossible d'annuler" },
    { status: 409 }
  );
}
