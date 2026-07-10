import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { analyzeBilan } from "@/lib/bilan-ai";
import type { BilanData } from "@/lib/bilan-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ id: z.string().min(1) });

/**
 * POST /api/bilan/analyze { id } → lance l'analyse experte (Hygie) du bilan et
 * la met en cache (bilan.analysis). Renvoie l'analyse.
 */
async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, employeeId: true, canAccessPayroll: true, employee: { select: { status: true } } },
  });
  const allowed =
    me &&
    canViewPayroll({
      role: me.role,
      employeeId: me.employeeId,
      canAccessPayroll: me.canAccessPayroll,
      employeeStatus: me.employee?.status ?? null,
    });
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const bilan = await prisma.bilan.findFirst({
    where: { id: parsed.data.id, pharmacyId: session.user.pharmacyId },
    select: { id: true, year: true, label: true, kind: true, data: true },
  });
  if (!bilan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const analysis = await analyzeBilan((bilan.data as BilanData) ?? {}, {
    year: bilan.year,
    label: bilan.label,
    kind: bilan.kind,
  });
  if (!analysis) {
    return NextResponse.json(
      { error: "L'analyse n'a pas pu être générée (service IA indisponible). Réessaie." },
      { status: 503 }
    );
  }

  await prisma.bilan
    .update({ where: { id: bilan.id }, data: { analysis: analysis as object } })
    .catch(() => {});
  return NextResponse.json({ analysis });
}

export const POST = withErrorHandling(POST__impl);
