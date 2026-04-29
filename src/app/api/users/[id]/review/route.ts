import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { reviewUserSchema } from "@/validators/auth";
import { sendApprovalEmail, sendRejectionEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Validation/refus d'une demande d'inscription par un admin.
 * Body: { decision: "APPROVE" | "REJECT", role?: "ADMIN" | "EMPLOYEE", note?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = reviewUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const { decision, role, employeeId, note } = parsed.data;

  // L'admin ne peut traiter que les demandes de SA pharmacie.
  // On récupère aussi name/email pour les emails de notification + nom de la pharmacie.
  const target = await prisma.user.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: {
      id: true,
      status: true,
      name: true,
      email: true,
      pharmacy: { select: { name: true } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (target.status !== "PENDING") {
    return NextResponse.json({ error: "ALREADY_REVIEWED" }, { status: 409 });
  }

  if (decision === "APPROVE") {
    if (!role) {
      return NextResponse.json(
        { error: "ROLE_REQUIRED" },
        { status: 400 }
      );
    }

    // Validation du lien collaborateur optionnel
    if (employeeId) {
      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, pharmacyId: session.user.pharmacyId },
        select: { id: true, user: { select: { id: true } } },
      });
      if (!employee) {
        return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
      }
      if (employee.user && employee.user.id !== target.id) {
        return NextResponse.json({ error: "EMPLOYEE_TAKEN" }, { status: 409 });
      }
    }

    await prisma.user.update({
      where: { id: target.id },
      data: {
        status: "APPROVED",
        role,
        isActive: true,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        rejectionNote: null,
        // null = on retire la liaison ; undefined = on ne touche pas
        employeeId: employeeId ?? null,
      },
    });
    revalidateTag(DASHBOARD_CACHE_TAGS.usersPending(session.user.pharmacyId));

    // Email de notification — best-effort
    await sendApprovalEmail({
      to: target.email,
      name: target.name,
      role,
      pharmacyName: target.pharmacy.name,
    });

    return NextResponse.json({ ok: true });
  }

  // REJECT
  await prisma.user.update({
    where: { id: target.id },
    data: {
      status: "REJECTED",
      isActive: false,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
      rejectionNote: note ?? null,
    },
  });
  revalidateTag(DASHBOARD_CACHE_TAGS.usersPending(session.user.pharmacyId));

  await sendRejectionEmail({
    to: target.email,
    name: target.name,
    pharmacyName: target.pharmacy.name,
    reason: note ?? null,
  });

  return NextResponse.json({ ok: true });
}
