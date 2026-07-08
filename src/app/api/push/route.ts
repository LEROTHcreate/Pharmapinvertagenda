import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
});

/**
 * Abonnement Web Push de l'utilisateur connecté.
 *  GET    → { configured } : le push est-il activé côté serveur (clés VAPID) ?
 *  POST   → enregistre/rafraîchit un abonnement { endpoint, keys }.
 *  DELETE → retire un abonnement { endpoint }.
 */
async function GET__impl() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ configured: isPushConfigured() });
}

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = subSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { endpoint, keys } = parsed.data;

  // Upsert par endpoint (unique) : réattribue au user courant + maj des clés.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: session.user.id },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}

async function DELETE__impl(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = (body as { endpoint?: string } | null)?.endpoint;
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: session.user.id },
    });
  }
  return NextResponse.json({ ok: true });
}

export const GET = withErrorHandling(GET__impl);
export const POST = withErrorHandling(POST__impl);
export const DELETE = withErrorHandling(DELETE__impl);
