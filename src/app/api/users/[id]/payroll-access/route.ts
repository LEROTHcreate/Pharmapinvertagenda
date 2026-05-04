import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canGrantPayrollAccess } from "@/lib/payroll-permissions";

export const runtime = "nodejs";

/**
 * PATCH /api/users/[id]/payroll-access
 * Body : { granted: boolean }
 *
 * Le SUPER-ADMIN (admin sans Employee lié = compte créateur de la pharmacie)
 * accorde ou révoque l'accès au module Rémunération à un autre admin.
 *
 * Garde-fous :
 *  - Seul un super-admin peut appeler cette route (403 sinon).
 *  - Seuls des comptes ADMIN peuvent recevoir l'accès (un EMPLOYEE n'a aucun
 *    sens en payroll : 403 si la cible n'est pas admin).
 *  - Multi-tenant : la cible doit être de la même pharmacie.
 */
const inputSchema = z.object({
  granted: z.boolean(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Vérifie que c'est bien le super-admin qui appelle
  if (
    !canGrantPayrollAccess({
      role: session.user.role,
      employeeId: session.user.employeeId,
    })
  ) {
    return NextResponse.json(
      { error: "Réservé au compte super-administrateur" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  // Cible : doit exister, être admin, dans la même pharmacie
  const target = await prisma.user.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }
  if (target.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Cet utilisateur n'est pas administrateur" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { canAccessPayroll: parsed.data.granted },
  });

  return NextResponse.json({ ok: true });
}
