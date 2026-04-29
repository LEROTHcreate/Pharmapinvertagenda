import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendMessageInput } from "@/validators/messaging";

export const runtime = "nodejs";

/**
 * Vérifie qu'un utilisateur peut accéder à une conversation.
 * - Membre de la conv → accès complet (lecture + écriture)
 * - Admin de la pharmacie → accès lecture seule (modération)
 * - Sinon → 403
 */
async function checkAccess(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: { where: { userId }, select: { id: true, lastReadAt: true } },
    },
  });
  if (!conv) return { ok: false as const, status: 404 };

  const session = await auth();
  if (!session?.user) return { ok: false as const, status: 401 };
  if (conv.pharmacyId !== session.user.pharmacyId) {
    return { ok: false as const, status: 403 };
  }

  const isMember = conv.members.length > 0;
  const isAdminShadow = !isMember && session.user.role === "ADMIN";

  if (!isMember && !isAdminShadow) {
    return { ok: false as const, status: 403 };
  }

  return {
    ok: true as const,
    conv,
    isMember,
    isAdminShadow,
    memberRecord: conv.members[0] ?? null,
  };
}

/**
 * GET /api/conversations/[id]/messages?since=<ISO>
 * Liste les messages d'une conv. `since` permet le polling incrémental.
 * Marque automatiquement la conv comme lue (lastReadAt = now) pour le membre.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const access = await checkAccess(params.id, session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: access.status });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;

  const messages = await prisma.message.findMany({
    where: {
      conversationId: params.id,
      ...(sinceDate ? { createdAt: { gt: sinceDate } } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true } },
      swapRequest: true,
    },
    take: 200,
  });

  // Marque comme lu si l'utilisateur est membre actif
  if (access.isMember) {
    await prisma.conversationMember.updateMany({
      where: { conversationId: params.id, userId: session.user.id },
      data: { lastReadAt: new Date() },
    });
  }

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      type: m.type,
      createdAt: m.createdAt.toISOString(),
      author: { id: m.author.id, name: m.author.name },
      swapRequest: m.swapRequest
        ? {
            id: m.swapRequest.id,
            status: m.swapRequest.status,
            requesterId: m.swapRequest.requesterId,
            targetId: m.swapRequest.targetId,
            date: m.swapRequest.date.toISOString().slice(0, 10),
            startTime: m.swapRequest.startTime,
            endTime: m.swapRequest.endTime,
            fullDay: m.swapRequest.fullDay,
            reason: m.swapRequest.reason,
            rejectionNote: m.swapRequest.rejectionNote,
          }
        : null,
    })),
    shadowAccess: access.isAdminShadow,
  });
}

/**
 * POST /api/conversations/[id]/messages
 * Envoie un message texte. Bumpe updatedAt de la conv pour le tri.
 * L'admin en shadow access ne peut PAS envoyer de message.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const access = await checkAccess(params.id, session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: access.status });
  }
  if (!access.isMember) {
    return NextResponse.json(
      { error: "Lecture seule (shadow access admin)" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = sendMessageInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const message = await prisma.message.create({
    data: {
      conversationId: params.id,
      authorId: session.user.id,
      body: parsed.data.body,
      type: "TEXT",
    },
  });
  // Bumpe la conv pour qu'elle remonte dans la liste
  await prisma.conversation.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });
  // Marque comme lu pour l'expéditeur
  await prisma.conversationMember.updateMany({
    where: { conversationId: params.id, userId: session.user.id },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({
    id: message.id,
    createdAt: message.createdAt.toISOString(),
  });
}
