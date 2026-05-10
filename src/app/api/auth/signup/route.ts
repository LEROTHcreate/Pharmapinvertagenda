import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { signupSchema } from "@/validators/auth";
import {
  sendSignupConfirmation,
  sendNewSignupAdminNotification,
} from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inscription d'un nouvel utilisateur.
 * Crée un User en `PENDING` rattaché à une pharmacie identifiée par son SIRET.
 * L'admin de la pharmacie doit ensuite approuver/refuser la demande.
 *
 * Rate-limit : 5 tentatives par IP toutes les 10 minutes pour éviter le spam
 * et l'énumération massive d'emails. Pas un anti-bot complet (pas de captcha) ;
 * pour ça, intégrer Turnstile / hCaptcha en complément.
 */
export async function POST(req: Request) {
  // ─── Rate limit avant toute lecture du body ───
  // Note : le bucket est par IP. Comme une pharmacie partage une IP NAT
  // pour tous ses appareils (PC, tablettes, mobiles), une limite trop
  // serrée bloque tout le monde dès qu'un utilisateur fait quelques essais
  // ratés. On garde une fenêtre généreuse (30 tentatives / 10 min) qui
  // bloque toujours les bots / spammers automatisés sans gêner les
  // utilisateurs légitimes en multi-appareil.
  const ip = getClientIp(req);
  const rl = checkRateLimit(`signup:${ip}`, {
    max: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "retry-after": String(retryAfterSec),
          "x-ratelimit-reset": String(rl.resetAt),
        },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const data = parsed.data;
  const { name, email, password } = data;

  // Email unique global, peu importe le mode
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  if (data.mode === "join") {
    // ─── Mode "Rejoindre une officine existante" ───────────────────
    // L'utilisateur fournit le SIRET. On vérifie que l'officine existe
    // ET qu'elle a bien un admin actif (sinon il faut passer par "create"
    // pour la première inscription).
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { siret: data.pharmacySiret },
      select: { id: true, name: true },
    });
    if (!pharmacy) {
      return NextResponse.json(
        { error: "PHARMACY_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Vérifie qu'au moins un admin actif existe : si non, l'officine est
    // "vide" → l'utilisateur doit créer le compte en mode "create" (et
    // c'est lui qui devient titulaire).
    const adminCount = await prisma.user.count({
      where: {
        pharmacyId: pharmacy.id,
        role: "ADMIN",
        isActive: true,
        status: "APPROVED",
      },
    });
    if (adminCount === 0) {
      return NextResponse.json(
        { error: "PHARMACY_NOT_INITIALIZED" },
        { status: 409 }
      );
    }

    await prisma.user.create({
      data: {
        name,
        email,
        hashedPassword,
        pharmacyId: pharmacy.id,
        role: "EMPLOYEE",
        status: "PENDING",
        isActive: false,
      },
    });

    revalidateTag(DASHBOARD_CACHE_TAGS.usersPending(pharmacy.id));

    await sendSignupConfirmation({
      to: email,
      name,
      pharmacyName: pharmacy.name,
    });

    void (async () => {
      try {
        const admins = await prisma.user.findMany({
          where: {
            pharmacyId: pharmacy.id,
            role: "ADMIN",
            isActive: true,
            status: "APPROVED",
          },
          select: { email: true },
        });
        if (admins.length === 0) return;
        await sendNewSignupAdminNotification({
          to: admins.map((a) => a.email),
          newUserName: name,
          newUserEmail: email,
          pharmacyName: pharmacy.name,
        });
      } catch (e) {
        console.error("[signup-admin-email] échec envoi notif admin:", e);
      }
    })();

    return NextResponse.json({ ok: true, mode: "join" }, { status: 201 });
  }

  // ─── Mode "Créer une nouvelle officine" ──────────────────────────
  // Le créateur devient automatiquement ADMIN APPROVED actif (titulaire).
  // Il pourra ensuite valider les futures demandes des collaborateurs.
  // On vérifie que le SIRET n'est pas déjà pris.
  const existingPharmacy = await prisma.pharmacy.findUnique({
    where: { siret: data.pharmacySiret },
    select: { id: true },
  });
  if (existingPharmacy) {
    return NextResponse.json(
      { error: "PHARMACY_ALREADY_EXISTS" },
      { status: 409 }
    );
  }

  // Création atomique pharmacie + premier admin
  const created = await prisma.$transaction(async (tx) => {
    const pharmacy = await tx.pharmacy.create({
      data: {
        name: data.pharmacyName,
        siret: data.pharmacySiret,
        address: data.pharmacyAddress?.trim() || null,
        phone: data.pharmacyPhone?.trim() || null,
      },
      select: { id: true, name: true },
    });

    const user = await tx.user.create({
      data: {
        name,
        email,
        hashedPassword,
        pharmacyId: pharmacy.id,
        role: "ADMIN",
        status: "APPROVED",
        isActive: true,
        reviewedAt: new Date(),
      },
      select: { id: true },
    });

    return { pharmacy, user };
  });

  // Email de bienvenue — on réutilise le template "confirmation"
  await sendSignupConfirmation({
    to: email,
    name,
    pharmacyName: created.pharmacy.name,
  });

  return NextResponse.json(
    { ok: true, mode: "create", pharmacyId: created.pharmacy.id },
    { status: 201 }
  );
}
