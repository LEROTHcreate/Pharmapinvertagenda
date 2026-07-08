import { createHmac, timingSafeEqual } from "crypto";

/**
 * Jeton de la vitrine publique (écran salle d'attente).
 *
 * L'écran vitrine est accessible SANS connexion, pour être affiché sur une TV /
 * tablette fixe. L'URL `/vitrine/<pharmacyId>?k=<jeton>` est protégée par un
 * HMAC de l'id d'officine avec un secret serveur : un visiteur ne peut pas
 * deviner l'URL d'une autre officine ni forger le jeton. La page n'expose que
 * de l'information publique (garde, horaires, message du jour) — pas de données
 * personnelles ni de planning.
 *
 * ⚠ Serveur uniquement (utilise `crypto`). Ne pas importer côté client.
 */

function secret(): string {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "pharma-vitrine-fallback-secret"
  );
}

export function vitrineToken(pharmacyId: string): string {
  return createHmac("sha256", secret())
    .update(`vitrine:${pharmacyId}`)
    .digest("base64url");
}

export function verifyVitrineToken(
  pharmacyId: string,
  token: string | null | undefined
): boolean {
  if (!token) return false;
  const expected = vitrineToken(pharmacyId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Chemin relatif de la vitrine (préfixer par l'origine pour l'URL complète). */
export function vitrinePath(pharmacyId: string): string {
  return `/vitrine/${pharmacyId}?k=${vitrineToken(pharmacyId)}`;
}
