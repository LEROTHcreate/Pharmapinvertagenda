import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { canApplyTemplates } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

export const runtime = "nodejs";

/** DELETE /api/templates/[id] — supprime un gabarit (admin) */
async function DELETE__impl(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canApplyTemplates(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const target = await prisma.weekTemplate.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Gabarit introuvable" }, { status: 404 });
  }

  await prisma.weekTemplate.delete({ where: { id: target.id } });
  revalidateTag(DASHBOARD_CACHE_TAGS.templatesList(session.user.pharmacyId));
  return NextResponse.json({ ok: true });
}

export const DELETE = withErrorHandling(DELETE__impl);
