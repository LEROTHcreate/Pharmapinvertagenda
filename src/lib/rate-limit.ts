/**
 * Rate-limiter en mémoire — simple, sans dépendance externe.
 * Adapté pour les endpoints publics à faible trafic (signup, password reset).
 *
 * ⚠ Limites :
 *  - Reset au redémarrage du serveur
 *  - Pas partagé entre instances (multi-region/scale-out)
 *  - Pour une utilisation prod sérieuse → Upstash Ratelimit, Cloudflare, etc.
 *
 * Algorithme : sliding window approximative — un compteur par clé qui
 * expire automatiquement après `windowMs`. Si N appels durant la fenêtre
 * glissante, la requête est rejetée.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Vérifie et incrémente le compteur pour une clé donnée.
 * Si autorisé : remaining > 0. Sinon : remaining = 0 + retry-after.
 */
export function checkRateLimit(
  key: string,
  options: { max: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.max - 1, resetAt };
  }

  if (existing.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: options.max - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Extrait l'IP cliente d'une Request Next.js.
 * Lit les en-têtes de proxy classiques (Netlify, Vercel, Cloudflare).
 * Fallback : "unknown" si rien — toutes les requêtes "unknown" partagent
 * alors le bucket (acceptable pour un signup public).
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/** Nettoyage périodique pour éviter de garder des buckets expirés indéfiniment. */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
if (typeof setInterval !== "undefined" && !cleanupTimer) {
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  // Ne pas empêcher le process de quitter (Node.js)
  if (typeof cleanupTimer === "object" && cleanupTimer && "unref" in cleanupTimer) {
    (cleanupTimer as { unref: () => void }).unref();
  }
}
