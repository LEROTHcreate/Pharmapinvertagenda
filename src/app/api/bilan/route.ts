import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vérifie que l'utilisateur a accès au module financier (titulaire autorisé). */
async function requireBilanAccess(userId: string) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      employeeId: true,
      canAccessPayroll: true,
      employee: { select: { status: true } },
    },
  });
  if (!me) return false;
  return canViewPayroll({
    role: me.role,
    employeeId: me.employeeId,
    canAccessPayroll: me.canAccessPayroll,
    employeeStatus: me.employee?.status ?? null,
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  year: z.number().int().min(1990).max(2100),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["REEL", "ESTIMATION"]).default("REEL"),
  data: z.record(z.string(), z.number()).default({}),
  sourceName: z.string().max(200).nullish(),
});

async function GET__impl() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await requireBilanAccess(session.user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const bilans = await prisma.bilan.findMany({
    where: { pharmacyId: session.user.pharmacyId },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      year: true,
      label: true,
      kind: true,
      data: true,
      analysis: true,
      sourceName: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ bilans });
}

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await requireBilanAccess(session.user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  const d = parsed.data;

  if (d.id) {
    // Mise à jour — scoping pharmacie. On efface l'analyse en cache (les données
    // changent → l'ancienne analyse n'est plus valable).
    const res = await prisma.bilan.updateMany({
      where: { id: d.id, pharmacyId: session.user.pharmacyId },
      data: {
        year: d.year,
        label: d.label,
        kind: d.kind,
        data: d.data,
        sourceName: d.sourceName ?? null,
        analysis: undefined,
      },
    });
    if (res.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    // Reset explicite de l'analyse (updateMany ne gère pas bien null Json via undefined).
    await prisma.bilan.update({ where: { id: d.id }, data: { analysis: undefined } }).catch(() => {});
    return NextResponse.json({ ok: true, id: d.id });
  }

  const created = await prisma.bilan.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      year: d.year,
      label: d.label,
      kind: d.kind,
      data: d.data,
      sourceName: d.sourceName ?? null,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: created.id });
}

export const GET = withErrorHandling(GET__impl);
export const POST = withErrorHandling(POST__impl);
