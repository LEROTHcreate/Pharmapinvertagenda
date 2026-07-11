import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminLevel } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function DELETE__impl(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!me || !isAdminLevel(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.bilan.deleteMany({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
  });
  return NextResponse.json({ ok: true });
}

export const DELETE = withErrorHandling(DELETE__impl);
