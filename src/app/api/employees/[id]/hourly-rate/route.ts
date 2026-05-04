import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPayroll } from "@/lib/payroll-permissions";

export const runtime = "nodejs";

/**
 * PATCH /api/employees/[id]/hourly-rate
 * Body : { hourlyGrossRate: number | null }
 *
 * Met à jour le taux horaire BRUT d'un employé. Réservé aux super-admins
 * et admins titulaires autorisés (canAccessPayroll=true).
 *
 * Multi-tenant : ne peut modifier qu'un Employee de la même pharmacie.
 */
const inputSchema = z.object({
  // null pour effacer le taux. Plafond 200€/h pour éviter erreurs de saisie.
  hourlyGrossRate: z.number().min(0).max(200).nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Vérification d'autorisation pleine
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      employeeId: true,
      canAccessPayroll: true,
      employee: { select: { status: true } },
    },
  });
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const allowed = canEditPayroll({
    role: me.role,
    employeeId: me.employeeId,
    canAccessPayroll: me.canAccessPayroll,
    employeeStatus: me.employee?.status ?? null,
  });
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide (taux horaire entre 0 et 200 €)" },
      { status: 400 }
    );
  }

  // Vérifie que l'employé existe ET appartient à la pharmacie de l'utilisateur
  const target = await prisma.employee.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });
  }

  await prisma.employee.update({
    where: { id: target.id },
    data: { hourlyGrossRate: parsed.data.hourlyGrossRate },
  });

  return NextResponse.json({ ok: true });
}
