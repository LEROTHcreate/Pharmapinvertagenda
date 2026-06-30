import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  setSupabasePassword,
  verifySupabasePassword,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z
    .string()
    .min(8, "Au moins 8 caractères")
    .max(128, "Au maximum 128 caractères"),
});

/**
 * POST /api/auth/change-password
 * Permet à un utilisateur connecté de changer son mot de passe.
 * Vérifie l'ancien avant d'autoriser le changement.
 */
async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { authUserId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  // Vérifie l'ancien mot de passe directement auprès de Supabase Auth
  // (source de vérité unique) — plus besoin du miroir bcrypt en BDD.
  const ok = await verifySupabasePassword(session.user.email, currentPassword);
  if (!ok) {
    return NextResponse.json(
      { error: "Mot de passe actuel incorrect" },
      { status: 401 }
    );
  }

  // Refuse si nouveau == ancien (incite à la rotation effective)
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit être différent de l'ancien" },
      { status: 400 }
    );
  }

  // Source de vérité unique : Supabase Auth (plus de miroir bcrypt en BDD).
  await setSupabasePassword(user.authUserId, newPassword);

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling(POST__impl);
