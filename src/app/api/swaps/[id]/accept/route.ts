import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

export const runtime = "nodejs";

/**
 * POST /api/swaps/[id]/accept
 * La cible accepte la demande → passe en PENDING_ADMIN.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id: params.id },
  });
  if (!swap || swap.pharmacyId !== session.user.pharmacyId) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  if (swap.targetId !== session.user.id) {
    return NextResponse.json(
      { error: "Seule la cible peut accepter cette demande" },
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
    data: { status: "PENDING_ADMIN", acceptedAt: new Date() },
  });
  // Invalide le badge admin (sidebar) — maintenant 1 demande à valider de plus
  revalidateTag(DASHBOARD_CACHE_TAGS.swapsPending(swap.pharmacyId));
  return NextResponse.json({ status: updated.status });
}
