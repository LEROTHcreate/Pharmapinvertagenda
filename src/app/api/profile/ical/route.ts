import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Activation / révocation du flux calendrier personnel (iCal).
 *  POST   → génère un jeton s'il n'existe pas et le renvoie (idempotent)
 *  DELETE → révoque le jeton (les agendas abonnés cessent de se mettre à jour)
 */
async function POST__impl() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { icalToken: true },
  });
  if (me?.icalToken) {
    return NextResponse.json({ token: me.icalToken });
  }

  // Jeton non devinable (48 hex). Boucle de sécurité en cas de collision.
  let token = randomBytes(24).toString("hex");
  for (let i = 0; i < 3; i++) {
    const clash = await prisma.user.findUnique({
      where: { icalToken: token },
      select: { id: true },
    });
    if (!clash) break;
    token = randomBytes(24).toString("hex");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { icalToken: token },
  });
  return NextResponse.json({ token });
}

async function DELETE__impl() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { icalToken: null },
  });
  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling(POST__impl);
export const DELETE = withErrorHandling(DELETE__impl);
