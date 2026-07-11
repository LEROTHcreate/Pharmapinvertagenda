import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { computePayrollForMonth } from "@/lib/payroll-month";

export const runtime = "nodejs";

/**
 * GET /api/payroll?month=YYYY-MM
 *
 * Renvoie les lignes de rémunération calculées pour le mois demandé.
 * Réservé aux super-admins + admins titulaires avec accès payroll.
 *
 * Sécurité multi-tenant : la requête ne lit QUE les Employee + ScheduleEntry
 * de la pharmacie de l'utilisateur connecté (filtre pharmacyId systématique).
 */
const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format attendu : YYYY-MM"),
});

async function GET__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Vérifie le rôle + le statut de l'Employee lié pour le filtrage titulaire
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

  const allowed = canViewPayroll({
    role: me.role,
    employeeId: me.employeeId,
    canAccessPayroll: me.canAccessPayroll,
    employeeStatus: me.employee?.status ?? null,
  });
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ month: url.searchParams.get("month") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètre 'month' invalide (format YYYY-MM)" },
      { status: 400 }
    );
  }

  // Calcul délégué au helper partagé (réutilisé par la page imprimable).
  const result = await computePayrollForMonth(
    session.user.pharmacyId,
    parsed.data.month
  );
  return NextResponse.json(result);
}

export const GET = withErrorHandling(GET__impl);
