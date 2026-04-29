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
 * POST /api/absences — création d'une demande par un collaborateur (ou un admin
 * pour son propre compte si lié à un Employee).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.employeeId) {
    return NextResponse.json(
      { error: "Aucun profil collaborateur associé à votre compte" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = createAbsenceInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const created = await prisma.absenceRequest.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      employeeId: session.user.employeeId,
      dateStart: new Date(`${parsed.data.dateStart}T00:00:00Z`),
      dateEnd: new Date(`${parsed.data.dateEnd}T00:00:00Z`),
      absenceCode: parsed.data.absenceCode,
      reason: parsed.data.reason || null,
      status: "PENDING",
    },
  });
  revalidateTag(DASHBOARD_CACHE_TAGS.absencesPending(session.user.pharmacyId));

  // Notification email aux TITULAIRES de la pharmacie uniquement
  // (eux seuls reçoivent et valident les demandes d'absence).
  void (async () => {
    try {
      const [titulaires, employee, pharmacy] = await Promise.all([
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
        prisma.employee.findUnique({
          where: { id: session.user.employeeId! },
          select: { firstName: true, lastName: true },
        }),
        prisma.pharmacy.findUnique({
          where: { id: session.user.pharmacyId },
          select: { name: true },
        }),
      ]);

      if (titulaires.length === 0 || !employee || !pharmacy) return;

      await sendAbsenceRequestEmail({
        to: titulaires.map((a) => a.email),
        employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
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

  return NextResponse.json({ id: created.id }, { status: 201 });
}
