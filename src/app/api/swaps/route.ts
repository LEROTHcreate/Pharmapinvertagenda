import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createSwapInput } from "@/validators/swap";

export const runtime = "nodejs";

/**
 * POST /api/swaps
 * Crée une demande d'échange dans une conversation.
 * Le demandeur est l'utilisateur courant ; la cible doit être membre de la
 * même conversation. Crée aussi un Message de type SWAP_REQUEST associé.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSwapInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { conversationId, targetId, date, fullDay, startTime, endTime, reason } =
    parsed.data;

  if (targetId === session.user.id) {
    return NextResponse.json(
      { error: "Impossible de se demander un échange à soi-même" },
      { status: 400 }
    );
  }

  // Vérifie : conv existe, demandeur ET cible sont membres, même pharmacie
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conv || conv.pharmacyId !== session.user.pharmacyId) {
    return NextResponse.json(
      { error: "Conversation introuvable" },
      { status: 404 }
    );
  }
  const memberIds = new Set(conv.members.map((m) => m.userId));
  if (!memberIds.has(session.user.id) || !memberIds.has(targetId)) {
    return NextResponse.json(
      { error: "Le demandeur et la cible doivent être membres de la conv" },
      { status: 403 }
    );
  }

  // Crée la demande + le message porteur dans une transaction
  const result = await prisma.$transaction(async (tx) => {
    const swap = await tx.shiftSwapRequest.create({
      data: {
        pharmacyId: session.user.pharmacyId,
        requesterId: session.user.id,
        targetId,
        date: new Date(`${date}T00:00:00Z`),
        fullDay,
        startTime: fullDay ? null : startTime ?? null,
        endTime: fullDay ? null : endTime ?? null,
        reason: reason || null,
      },
    });
    const message = await tx.message.create({
      data: {
        conversationId,
        authorId: session.user.id,
        type: "SWAP_REQUEST",
        body: "", // contenu structuré dans swapRequest
        swapRequestId: swap.id,
      },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return { swap, message };
  });

  return NextResponse.json({
    swapId: result.swap.id,
    messageId: result.message.id,
  });
}

/**
 * GET /api/swaps?status=PENDING_ADMIN
 * Liste les demandes (filtrables par statut). Admin only pour le statut admin ;
 * un collaborateur voit ses propres demandes (faites OU reçues).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const isAdmin = session.user.role === "ADMIN";

  const where: Record<string, unknown> = { pharmacyId: session.user.pharmacyId };
  if (status) where.status = status;
  if (!isAdmin) {
    where.OR = [
      { requesterId: session.user.id },
      { targetId: session.user.id },
    ];
  }

  const swaps = await prisma.shiftSwapRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      requester: { select: { id: true, name: true } },
      target: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return NextResponse.json({
    swaps: swaps.map((s) => ({
      id: s.id,
      status: s.status,
      date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      fullDay: s.fullDay,
      reason: s.reason,
      rejectionNote: s.rejectionNote,
      requester: s.requester,
      target: s.target,
      reviewedBy: s.reviewedBy,
      createdAt: s.createdAt.toISOString(),
      acceptedAt: s.acceptedAt?.toISOString() ?? null,
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
    })),
  });
}
