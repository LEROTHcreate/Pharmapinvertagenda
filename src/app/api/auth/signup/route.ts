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
  const { name, email, password } = parsed.data;

  // ─── Mode mono-pharmacie ────────────────────────────────────────
  // L'app est en mono-pharmacie pour l'instant : on attache le compte à
  // l'unique pharmacie de la base.
  // ⚠️ Garde-fou anti-régression : si jamais une 2ᵉ pharmacie est ajoutée
  // (multi-tenant), ce flow devient une faille (cross-tenant signup) — on
  // refuse alors l'inscription tant que le formulaire ne demande pas un
  // identifiant pharmacie (cf. tâche 3 de l'audit, à réactiver). Ne pas
  // retirer ce garde-fou sans réintroduire une sélection explicite côté UI.
  const pharmacyCount = await prisma.pharmacy.count();
  if (pharmacyCount > 1) {
    return NextResponse.json(
      { error: "MULTI_PHARMACY_REQUIRES_SIRET" },
      { status: 503 }
    );
  }
  const pharmacy = await prisma.pharmacy.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!pharmacy) {
    return NextResponse.json({ error: "PHARMACY_NOT_FOUND" }, { status: 404 });
  }

  // Email unique global.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      name,
      email,
      hashedPassword,
      pharmacyId: pharmacy.id,
      role: "EMPLOYEE",   // Rôle par défaut — l'admin choisira lors de l'approbation
      status: "PENDING",  // En attente d'examen
      isActive: false,    // Inactif tant que non approuvé
    },
  });

  // Invalide le compteur "demandes en attente" du dashboard admin.
  revalidateTag(DASHBOARD_CACHE_TAGS.usersPending(pharmacy.id));

  // Email de confirmation au demandeur (best-effort, ne bloque pas le signup)
  await sendSignupConfirmation({
    to: email,
    name,
    pharmacyName: pharmacy.name,
  });

  // Notification aux admins de la pharmacie — best-effort en arrière-plan
  // pour ne pas bloquer la réponse au signup (les requêtes DB + envoi mail
  // peuvent prendre 1-2s, on ne fait pas attendre l'utilisateur pour ça).
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

  return NextResponse.json({ ok: true }, { status: 201 });
}
