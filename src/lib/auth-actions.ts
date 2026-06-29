"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginResult = { ok: true } | { ok: false; error: string };

/**
 * Connexion email/mot de passe via Supabase Auth.
 *
 * Reprend les garde-fous de l'ancien `authorize()` NextAuth :
 *  - rate-limit anti brute-force (10 tentatives / 15 min par email) ;
 *  - refus SILENCIEUX (même message générique) si le compte est inexistant,
 *    désactivé ou non approuvé → évite l'énumération d'emails et la
 *    divulgation du statut ;
 *  - trace `lastLoginAt` (best-effort).
 *
 * En cas de succès, `signInWithPassword` pose les cookies de session Supabase
 * (autorisé depuis une server action).
 */
export async function loginAction(
  email: string,
  password: string
): Promise<LoginResult> {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (!parsed.success) return { ok: false, error: "INVALID" };

  const normalizedEmail = parsed.data.email.toLowerCase();

  // ─── Rate-limit par email ───
  const limit = checkRateLimit(`login:email:${normalizedEmail}`, {
    max: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    console.warn(`[auth] login rate-limited for ${normalizedEmail}`);
    return { ok: false, error: "INVALID" };
  }

  // ─── Gate métier : compte actif ET approuvé ───
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, isActive: true, status: true },
  });
  if (!user || !user.isActive || user.status !== "APPROVED") {
    return { ok: false, error: "INVALID" };
  }

  // ─── Authentification Supabase ───
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: "INVALID" };

  // Trace la connexion (best-effort : ne bloque pas si l'écriture échoue).
  prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch((e) => console.error("[auth] échec mise à jour lastLoginAt:", e));

  return { ok: true };
}

/** Déconnexion : efface la session Supabase puis redirige vers /login. */
export async function logoutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
