import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPayroll } from "@/lib/payroll-permissions";

export const runtime = "nodejs";

/**
 * POST /api/payroll/revenue
 * Body : { month: "YYYY-MM", revenueHT: number | null, marginHT?: number | null }
 *
 * Enregistre (upsert) le chiffre d'affaires HT du mois pour la pharmacie —
 * sert au ratio masse salariale / CA sur la page Rémunération. revenueHT null
 * supprime la saisie du mois. Mêmes droits que la page Rémunération.
 */
const inputSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format attendu : YYYY-MM"),
  revenueHT: z.number().min(0).max(100_000_000).nullable(),
  marginHT: z.number().min(0).max(100_000_000).nullable().optional(),
});

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      employeeId: true,
      canAccessPayroll: true,
      employee: { select: { status: true } },
    },
  });
  if (
    !me ||
    !canEditPayroll({
      role: me.role,
      employeeId: me.employeeId,
      canAccessPayroll: me.canAccessPayroll,
      employeeStatus: me.employee?.status ?? null,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload invalide" },
      { status: 400 }
    );
  }
  const { month, revenueHT, marginHT } = parsed.data;
  const pharmacyId = session.user.pharmacyId;

  // revenueHT null → on efface la saisie du mois (retour à "non renseigné").
  if (revenueHT === null) {
    await prisma.monthlyRevenue.deleteMany({ where: { pharmacyId, month } });
    return NextResponse.json({ ok: true, revenue: null });
  }

  const saved = await prisma.monthlyRevenue.upsert({
    where: { pharmacyId_month: { pharmacyId, month } },
    create: { pharmacyId, month, revenueHT, marginHT: marginHT ?? null },
    update: { revenueHT, marginHT: marginHT ?? null },
    select: { revenueHT: true, marginHT: true },
  });
  return NextResponse.json({ ok: true, revenue: saved });
}

export const POST = withErrorHandling(POST__impl);
