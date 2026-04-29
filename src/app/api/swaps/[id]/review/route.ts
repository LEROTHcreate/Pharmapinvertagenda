import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewSwapInput } from "@/validators/swap";
import { TIME_SLOTS } from "@/types";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { isTaskAllowed } from "@/lib/role-task-rules";

export const runtime = "nodejs";

/**
 * POST /api/swaps/[id]/review
 * L'admin valide ou refuse la demande.
 *
 * Si APPROVED : on met à jour le planning :
 *  - Récupère les créneaux du demandeur sur le jour/plage concernée (TASK uniquement)
 *  - Pour chaque créneau, on déplace la TASK vers la cible (delete demandeur, upsert cible)
 *  - Conflit possible : si la cible avait déjà un TASK sur le même créneau → on ne touche pas
 *    et on retourne la liste des conflits (l'admin règle manuellement)
 */
export async function POST(
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

  const body = await req.json().catch(() => ({}));
  const parsed = reviewSwapInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: { select: { employeeId: true } },
      target: {
        select: {
          employeeId: true,
          employee: { select: { status: true } },
        },
      },
    },
  });
  if (!swap || swap.pharmacyId !== session.user.pharmacyId) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (swap.status !== "PENDING_ADMIN") {
    return NextResponse.json(
      { error: "La demande n'est pas en attente de validation admin" },
      { status: 409 }
    );
  }

  // Refus admin → simple maj statut
  if (!parsed.data.approve) {
    await prisma.shiftSwapRequest.update({
      where: { id: params.id },
      data: {
        status: "REJECTED_ADMIN",
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        rejectionNote: parsed.data.rejectionNote || null,
      },
    });
    revalidateTag(DASHBOARD_CACHE_TAGS.swapsPending(swap.pharmacyId));
    return NextResponse.json({ status: "REJECTED_ADMIN" });
  }

  // ─── Approbation : mise à jour du planning ──────────────────────
  const requesterEmpId = swap.requester.employeeId;
  const targetEmpId = swap.target.employeeId;

  if (!requesterEmpId || !targetEmpId) {
    return NextResponse.json(
      {
        error:
          "Le demandeur ou la cible n'a pas de profil collaborateur associé — impossible de mettre à jour le planning",
      },
      { status: 400 }
    );
  }

  // Détermine les créneaux concernés
  const slotsInRange = swap.fullDay
    ? TIME_SLOTS
    : TIME_SLOTS.filter(
        (s) => s >= (swap.startTime ?? "00:00") && s < (swap.endTime ?? "23:59")
      );

  // Récupère les TASK du demandeur sur ce jour + plage
  const requesterEntries = await prisma.scheduleEntry.findMany({
    where: {
      employeeId: requesterEmpId,
      date: swap.date,
      timeSlot: { in: slotsInRange },
      type: "TASK",
    },
  });

  // Vérifie les conflits côté cible
  const targetExisting = await prisma.scheduleEntry.findMany({
    where: {
      employeeId: targetEmpId,
      date: swap.date,
      timeSlot: { in: slotsInRange },
    },
  });
  const targetBusySlots = new Set(targetExisting.map((e) => e.timeSlot));

  // Re-check rôle/poste : la cible doit pouvoir effectivement assurer chaque
  // poste du demandeur (sinon on pourrait écrire COMPTOIR sur un livreur etc.)
  const targetStatus = swap.target.employee?.status ?? null;

  // Conflits : créneau déjà pris OU poste incompatible avec le rôle de la cible
  const conflicts: Array<{ timeSlot: string; reason: string }> = [];
  const transferable: typeof requesterEntries = [];
  for (const e of requesterEntries) {
    if (targetBusySlots.has(e.timeSlot)) {
      conflicts.push({
        timeSlot: e.timeSlot,
        reason: "La cible avait déjà un poste sur ce créneau",
      });
      continue;
    }
    if (
      e.taskCode &&
      targetStatus &&
      !isTaskAllowed(targetStatus, e.taskCode)
    ) {
      conflicts.push({
        timeSlot: e.timeSlot,
        reason: `Le poste ${e.taskCode} n'est pas autorisé pour le rôle ${targetStatus}`,
      });
      continue;
    }
    transferable.push(e);
  }

  await prisma.$transaction(async (tx) => {
    for (const entry of transferable) {
      // Crée le créneau sur la cible
      await tx.scheduleEntry.upsert({
        where: {
          employeeId_date_timeSlot: {
            employeeId: targetEmpId,
            date: entry.date,
            timeSlot: entry.timeSlot,
          },
        },
        update: {
          type: entry.type,
          taskCode: entry.taskCode,
          absenceCode: null,
          notes: entry.notes,
        },
        create: {
          pharmacyId: swap.pharmacyId,
          employeeId: targetEmpId,
          date: entry.date,
          timeSlot: entry.timeSlot,
          type: entry.type,
          taskCode: entry.taskCode,
          absenceCode: null,
          notes: entry.notes,
        },
      });
      // Supprime le créneau du demandeur
      await tx.scheduleEntry.delete({ where: { id: entry.id } });
    }
    // Marque la demande comme approuvée
    await tx.shiftSwapRequest.update({
      where: { id: params.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });
  });
  revalidateTag(DASHBOARD_CACHE_TAGS.swapsPending(swap.pharmacyId));

  return NextResponse.json({
    status: "APPROVED",
    transferred: transferable.length,
    conflicts,
  });
}
