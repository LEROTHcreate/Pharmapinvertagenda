import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Web Push — envoi de notifications hors-app.
 *
 * Nécessite 3 variables d'env :
 *  - NEXT_PUBLIC_VAPID_PUBLIC_KEY (exposée au client pour l'abonnement)
 *  - VAPID_PRIVATE_KEY            (SECRET serveur)
 *  - VAPID_SUBJECT                (mailto: ou URL, ex. "mailto:contact@…")
 *
 * Si les clés sont absentes, tout est ignoré silencieusement (comme l'e-mail
 * sans fournisseur) → l'app fonctionne, le push est simplement inactif.
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim();
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:contact@pharmaplanning.fr";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return !!PUBLIC_KEY && !!PRIVATE_KEY;
}

export type PushPayload = {
  title: string;
  body: string;
  /** URL ouverte au clic (défaut /accueil). */
  url?: string;
  /** Regroupe/écrase les notifs de même tag. */
  tag?: string;
};

/**
 * Envoie une notification push à tous les abonnements des utilisateurs donnés.
 * Best-effort : les abonnements expirés (404/410) sont purgés. Ne throw jamais.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number }> {
  if (!ensureConfigured() || userIds.length === 0) return { sent: 0 };

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return { sent: 0 };

  const body = JSON.stringify(payload);
  const stale: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        // 404/410 = abonnement mort (navigateur désinstallé, permission retirée).
        if (code === 404 || code === 410) stale.push(s.id);
      }
    })
  );

  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } }).catch(() => {});
  }
  return { sent };
}

/** Raccourci : push à toute l'équipe active d'une pharmacie (option: exclure un user). */
export async function sendPushToPharmacy(
  pharmacyId: string,
  payload: PushPayload,
  excludeUserId?: string
): Promise<{ sent: number }> {
  if (!isPushConfigured()) return { sent: 0 };
  const users = await prisma.user.findMany({
    where: {
      pharmacyId,
      status: "APPROVED",
      isActive: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return sendPushToUsers(
    users.map((u) => u.id),
    payload
  );
}
