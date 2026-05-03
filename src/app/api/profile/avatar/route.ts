import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isValidAvatarId } from "@/lib/avatars";

export const runtime = "nodejs";

/**
 * PATCH /api/profile/avatar — l'utilisateur connecté met à jour son avatar.
 *
 * Body : { avatarId: string | null }
 *  - `null` ou champ absent → retire l'avatar (retombe sur la pastille initiale)
 *  - autre valeur → doit appartenir au catalogue (cf. src/lib/avatars.ts)
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    avatarId?: string | null;
  } | null;
  const raw = body?.avatarId;

  // Normalise : null/undefined/"" → reset
  const next: string | null =
    raw == null || raw === "" ? null : String(raw);

  if (next !== null && !isValidAvatarId(next)) {
    return NextResponse.json(
      { error: "Avatar inconnu" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarId: next },
  });

  return NextResponse.json({ avatarId: next });
}
