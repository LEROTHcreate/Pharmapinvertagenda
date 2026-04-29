import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rejectSwapInput } from "@/validators/swap";

export const runtime = "nodejs";

/**
 * POST /api/swaps/[id]/reject
 * La cible refuse la demande → REJECTED_TARGET.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = rejectSwapInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id: params.id },
  });
  if (!swap || swap.pharmacyId !== session.user.pharmacyId) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (swap.targetId !== session.user.id) {
    return NextResponse.json(
      { error: "Seule la cible peut refuser cette demande" },
      { status: 403 }
    );
  }
  if (swap.status !== "PENDING_TARGET") {
    return NextResponse.json(
      { error: `Demande déjà ${swap.status.toLowerCase()}` },
      { status: 409 }
    );
  }

  const updated = await prisma.shiftSwapRequest.update({
    where: { id: params.id },
    data: {
      status: "REJECTED_TARGET",
      rejectionNote: parsed.data.rejectionNote || null,
    },
  });
  return NextResponse.json({ status: updated.status });
}
