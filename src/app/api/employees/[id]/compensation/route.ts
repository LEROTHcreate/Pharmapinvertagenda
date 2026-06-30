import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPayroll } from "@/lib/payroll-permissions";

export const runtime = "nodejs";

/**
 * PATCH /api/employees/[id]/compensation
 * Body : {
 *   payMode?: "HOURLY" | "MONTHLY",
 *   hourlyGrossRate?: number | null,     // mode HOURLY
 *   monthlyGrossSalary?: number | null,  // mode MONTHLY
 *   coefficient?: number | null,         // coefficient conventionnel
 * }
 *
 * Met à jour la rémunération d'un salarié (mode + valeur + coefficient).
 * Mêmes droits que la page Rémunération. Multi-tenant strict.
 */
const inputSchema = z
  .object({
    payMode: z.enum(["HOURLY", "MONTHLY"]).optional(),
    hourlyGrossRate: z.number().min(0).max(200).nullable().optional(),
    monthlyGrossSalary: z.number().min(0).max(50000).nullable().optional(),
    coefficient: z.number().int().min(0).max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Aucun champ à mettre à jour",
  });

async function PATCH__impl(req: Request, { params }: { params: { id: string } }) {
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
      { error: "Payload invalide (mode/valeurs de rémunération)" },
      { status: 400 }
    );
  }

  const target = await prisma.employee.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });
  }

  await prisma.employee.update({
    where: { id: target.id },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorHandling(PATCH__impl);
