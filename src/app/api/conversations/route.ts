import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createConversationInput } from "@/validators/messaging";

export const runtime = "nodejs";

/**
 * GET /api/conversations
 * Liste les conversations de l'utilisateur courant.
 * Pour un admin : retourne aussi un flag `shadowAccess` indiquant que
 * l'admin peut accéder à TOUTES les conversations de la pharmacie pour
 * modération (paramètre ?all=1).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";
  const isAdmin = session.user.role === "ADMIN";

  // Mode "all" : seulement pour admin (shadow access pour modération)
  const where =
    all && isAdmin
      ? { pharmacyId: session.user.pharmacyId }
      : {
          pharmacyId: session.user.pharmacyId,
          members: { some: { userId: session.user.id } },
        };

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          type: true,
          createdAt: true,
          authorId: true,
        },
      },
    },
  });

  // Compteur unread pour chaque conversation (pour l'utilisateur courant)
  const result = conversations.map((c) => {
    const myMember = c.members.find((m) => m.userId === session.user.id);
    const last = c.messages[0] ?? null;
    const unread =
      myMember && last
        ? !myMember.lastReadAt || last.createdAt > myMember.lastReadAt
        : false;
    return {
      id: c.id,
      name: c.name,
      isGroup: c.isGroup,
      updatedAt: c.updatedAt.toISOString(),
      members: c.members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.user.role,
      })),
      lastMessage: last
        ? {
            id: last.id,
            body: last.body,
            type: last.type,
            createdAt: last.createdAt.toISOString(),
            authorId: last.authorId,
          }
        : null,
      unread,
      // Si vrai, l'utilisateur courant n'est pas membre mais admin en lecture
      shadowAccess: !myMember,
    };
  });

  return NextResponse.json({ conversations: result });
}

/**
 * POST /api/conversations
 * Crée une conversation (1-1 si 1 membre, groupe si plusieurs).
 * Pour les 1-1, on retourne la conv existante si elle existe déjà entre les
 * deux utilisateurs (pas de doublon).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createConversationInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const myId = session.user.id;
  // Dédup + retire moi-même
  const memberIds = Array.from(
    new Set(parsed.data.memberIds.filter((id) => id !== myId))
  );
  if (memberIds.length === 0) {
    return NextResponse.json(
      { error: "Au moins un autre membre est requis" },
      { status: 400 }
    );
  }

  // Vérifie que tous les membres appartiennent à la même pharmacie
  const targetUsers = await prisma.user.findMany({
    where: {
      id: { in: memberIds },
      pharmacyId: session.user.pharmacyId,
      isActive: true,
      status: "APPROVED",
    },
    select: { id: true },
  });
  if (targetUsers.length !== memberIds.length) {
    return NextResponse.json(
      { error: "Un ou plusieurs membres sont introuvables ou inactifs" },
      { status: 400 }
    );
  }

  const isGroup = memberIds.length >= 2;

  // Pour les 1-1, on cherche d'abord une conv existante exactement entre les 2
  if (!isGroup) {
    const otherId = memberIds[0];
    const existing = await prisma.conversation.findFirst({
      where: {
        pharmacyId: session.user.pharmacyId,
        isGroup: false,
        AND: [
          { members: { some: { userId: myId } } },
          { members: { some: { userId: otherId } } },
        ],
      },
      include: { members: true },
    });
    // S'assurer qu'il n'y a que 2 membres
    if (existing && existing.members.length === 2) {
      return NextResponse.json({ conversationId: existing.id, existed: true });
    }
  }

  const conv = await prisma.conversation.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      createdById: myId,
      isGroup,
      name: isGroup ? parsed.data.name?.trim() || null : null,
      members: {
        create: [
          { userId: myId },
          ...memberIds.map((id) => ({ userId: id })),
        ],
      },
    },
  });

  return NextResponse.json({ conversationId: conv.id, existed: false });
}
