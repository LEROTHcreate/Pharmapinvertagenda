import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAbsenceInput } from "@/validators/absence";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { sendAbsenceRequestEmail } from "@/lib/email";
import { ABSENCE_LABELS } from "@/types";

export const runtime = "nodejs";

/**
 * GET /api/absences?status=PENDING
 * Admin → toutes les demandes de la pharmacie.
 * Employee → uniquement ses propres demandes (filtre par employeeId).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const where: Record<string, unknown> = {
    pharmacyId: session.user.pharmacyId,
  };
  if (status === "PENDING" || status === "APPROVED" || status === "REJECTED") {
    where.status = status;
  }
  if (session.user.role === "EMPLOYEE") {
    if (!session.user.employeeId) {
      return NextResponse.json({ requests: [] });
    }
    where.employeeId = session.user.employeeId;
  }

  const requests = await prisma.absenceRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { dateStart: "desc" }],
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employee: r.employee,
      dateStart: r.dateStart.toISOString().slice(0, 10),
      dateEnd: r.dateEnd.toISOString().slice(0, 10),
      absenceCode: r.absenceCode,
      status: r.status,
      reason: r.reason,
      adminNote: r.adminNote,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  });
}

/**
 * POST /api/absences — deux modes :
 *
 *  1. Demande classique d'un collaborateur → status PENDING, l'admin valide
 *     ensuite via PATCH /api/absences/[id].
 *
 *  2. Saisie manuelle ADMIN (toolbar Absences) → admin choisit un collaborateur
 *     cible (`targetEmployeeId`) et coche `autoApprove: true`. La demande est
 *     créée APPROVED ET les ScheduleEntry existants dans la plage sont
 *     convertis en ABSENCE — même résultat qu'une approbation classique, en
 *     un seul appel.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createAbsenceInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const isAdmin = session.user.role === "ADMIN";
  const wantsAdminMode =
    !!parsed.data.targetEmployeeId || parsed.data.autoApprove === true;
  if (wantsAdminMode && !isAdmin) {
    return NextResponse.json(
      {
        error:
          "Réservé à l'administration : impossible de cibler un autre collaborateur ou de valider directement.",
      },
      { status: 403 }
    );
  }

  // Détermine le collaborateur concerné par l'absence
  const targetEmployeeId =
    parsed.data.targetEmployeeId ?? session.user.employeeId ?? null;
  if (!targetEmployeeId) {
    return NextResponse.json(
      { error: "Aucun profil collaborateur associé à votre compte" },
      { status: 400 }
    );
  }

  // Vérifie que le collaborateur cible appartient bien à la pharmacie
  const targetEmployee = await prisma.employee.findFirst({
    where: {
      id: targetEmployeeId,
      pharmacyId: session.user.pharmacyId,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!targetEmployee) {
    return NextResponse.json(
      { error: "Collaborateur introuvable dans votre pharmacie" },
      { status: 404 }
    );
  }

  const dateStart = new Date(`${parsed.data.dateStart}T00:00:00Z`);
  const dateEnd = new Date(`${parsed.data.dateEnd}T00:00:00Z`);
  const isManualApproval = isAdmin && parsed.data.autoApprove === true;

  let created;
  if (isManualApproval) {
    // ─── Saisie admin auto-validée : statut APPROVED + conversion des
    //     créneaux existants en ABSENCE en une seule transaction ────────
    created = await prisma.$transaction(async (tx) => {
      const req = await tx.absenceRequest.create({
        data: {
          pharmacyId: session.user.pharmacyId,
          employeeId: targetEmployee.id,
          dateStart,
          dateEnd,
          absenceCode: parsed.data.absenceCode,
          reason: parsed.data.reason || null,
          status: "APPROVED",
          reviewedAt: new Date(),
        },
      });
      // Convertit tous les TASK existants en ABSENCE sur la plage
      const existing = await tx.scheduleEntry.findMany({
        where: {
          employeeId: targetEmployee.id,
          date: { gte: dateStart, lte: dateEnd },
        },
        select: { id: true },
      });
      if (existing.length > 0) {
        await tx.scheduleEntry.updateMany({
          where: { id: { in: existing.map((e) => e.id) } },
          data: {
            type: "ABSENCE",
            taskCode: null,
            absenceCode: parsed.data.absenceCode,
          },
        });
      }
      return req;
    });
  } else {
    // ─── Demande classique en attente de validation ──────────────────
    created = await prisma.absenceRequest.create({
      data: {
        pharmacyId: session.user.pharmacyId,
        employeeId: targetEmployee.id,
        dateStart,
        dateEnd,
        absenceCode: parsed.data.absenceCode,
        reason: parsed.data.reason || null,
        status: "PENDING",
      },
    });
  }
  revalidateTag(DASHBOARD_CACHE_TAGS.absencesPending(session.user.pharmacyId));

  // Notification email aux TITULAIRES uniquement pour les demandes PENDING
  // (la saisie admin auto-validée n'a pas besoin de notif — elle est déjà
  // traitée).
  if (!isManualApproval) {
    void (async () => {
      try {
        const [titulaires, pharmacy] = await Promise.all([
          prisma.user.findMany({
            where: {
              pharmacyId: session.user.pharmacyId,
              role: "ADMIN",
              isActive: true,
              status: "APPROVED",
              employee: { status: "TITULAIRE" },
            },
            select: { email: true },
          }),
          prisma.pharmacy.findUnique({
            where: { id: session.user.pharmacyId },
            select: { name: true },
          }),
        ]);

        if (titulaires.length === 0 || !pharmacy) return;

        await sendAbsenceRequestEmail({
          to: titulaires.map((a) => a.email),
          employeeName: `${targetEmployee.firstName} ${targetEmployee.lastName}`.trim(),
          absenceLabel: ABSENCE_LABELS[parsed.data.absenceCode],
          dateStart: parsed.data.dateStart,
          dateEnd: parsed.data.dateEnd,
          reason: parsed.data.reason ?? null,
          pharmacyName: pharmacy.name,
        });
      } catch (e) {
        console.error("[absence-email] échec envoi notif titulaires:", e);
      }
    })();
  }

  return NextResponse.json(
    { id: created.id, status: created.status },
    { status: 201 }
  );
}
