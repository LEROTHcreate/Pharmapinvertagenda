import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/validators/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_MIN = 60; // expiration du lien de reset

/**
 * POST /api/auth/forgot-password
 *
 * Génère un token de reset à usage unique et l'envoie par email.
 * Réponse identique (200 ok:true) que l'email existe ou pas — on évite
 * l'énumération de comptes.
 *
 * Le token brut transite uniquement dans l'email ; la BDD ne stocke que
 * son hash SHA-256. Si la BDD fuite, les liens en circulation deviennent
 * inutilisables (tant que l'attaquant n'a pas accès à l'email).
 */
export async function POST(req: Request) {
  // Rate limit : 5 demandes / 15 min / IP — assez pour les vrais oublis,
  // pas assez pour spammer les boîtes mail des utilisateurs.
  const ip = getClientIp(req);
  const rl = checkRateLimit(`forgot:${ip}`, { max: 5, windowMs: 15 * 60_000 });
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
    return NextResponse.json({ ok: true }); // ne pas leak l'erreur de parse
  }

  const parsed = forgotPasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: true }); // idem
  }
  const { email } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, isActive: true, status: true },
  });

  // Si pas de compte, ou compte non approuvé / désactivé → on retourne ok:true
  // sans rien envoyer (anti-énumération).
  if (!user || !user.isActive || user.status !== "APPROVED") {
    return NextResponse.json({ ok: true });
  }

  // Génère un token aléatoire 256 bits (URL-safe), stocke son hash en BDD.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MIN * 60_000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: expires,
    },
  });

  // Construit l'URL de reset
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const resetUrl = `${base}/reset-password?token=${rawToken}`;

  // Email best-effort — on retourne ok même si l'envoi rate (sinon on
  // donnerait un signal pour énumérer les emails valides en mesurant les
  // temps de réponse). Le user retentera s'il n'a rien reçu.
  await sendPasswordResetEmail({
    to: email,
    name: user.name,
    resetUrl,
    expiresInMinutes: TOKEN_TTL_MIN,
  });

  return NextResponse.json({ ok: true });
}
