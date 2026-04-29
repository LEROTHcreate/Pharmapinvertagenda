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

  // APPROVE → maj du statut + transformation des créneaux planning concernés
  let convertedCount = 0;
  await prisma.$transaction(async (tx) => {
    // Tous les créneaux existants de le collaborateur dans la plage [dateStart, dateEnd]
    const existing = await tx.scheduleEntry.findMany({
      where: {
        employeeId: request.employeeId,
        date: { gte: request.dateStart, lte: request.dateEnd },
      },
      select: { id: true },
    });
    if (existing.length > 0) {
      const result = await tx.scheduleEntry.updateMany({
        where: { id: { in: existing.map((e) => e.id) } },
        data: {
          type: "ABSENCE",
          taskCode: null,
          absenceCode: request.absenceCode,
        },
      });
      convertedCount = result.count;
    }
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
 * DELETE /api/absences/[id] — annulation par le demandeur ou un admin,
 * uniquement si la demande est encore PENDING.
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
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (request.status !== "PENDING") {
    return NextResponse.json(
      { error: "Demande déjà traitée — impossible d'annuler" },
      { status: 409 }
    );
  }

  await prisma.absenceRequest.delete({ where: { id: params.id } });
  revalidateTag(DASHBOARD_CACHE_TAGS.absencesPending(session.user.pharmacyId));

  return NextResponse.json({ ok: true });
}
