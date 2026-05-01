import { NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/validators/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-password
 *
 * Vérifie le token (en hashant celui reçu et en comparant au hash stocké),
 * met à jour le mot de passe, invalide le token (un usage unique).
 */
export async function POST(req: Request) {
  // Rate limit : 10 tentatives / 15 min / IP — protège contre le brute-force
  // d'un token actif.
  const ip = getClientIp(req);
  const rl = checkRateLimit(`reset:${ip}`, { max: 10, windowMs: 15 * 60_000 });
  if (!rl.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "retry-after": String(retryAfterSec) },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();

  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { gt: now },
      isActive: true,
      status: "APPROVED",
    },
    select: { id: true },
  });
  if (!user) {
    // Lien invalide ou expiré (ou compte désactivé) — on renvoie un code
    // unique pour que la page client guide vers une nouvelle demande.
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      hashedPassword,
      // Token consommé : on le clear pour empêcher la réutilisation.
      passwordResetTokenHash: null,
      passwordResetExpires: null,
    },
  });

  return NextResponse.json({ ok: true });
}
