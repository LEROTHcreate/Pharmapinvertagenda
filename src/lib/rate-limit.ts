/**
 * Rate-limiter PARTAGÉ entre instances (table Postgres `rate_limit_buckets`).
 *
 * Pourquoi : l'ancien rate-limiter utilisait un `Map` en mémoire → sur Vercel
 * serverless, chaque lambda a son propre Map, donc la protection anti
 * brute-force était quasi inopérante (un attaquant tape sur N instances).
 * Ici, le compteur vit dans Postgres : tous les lambdas partagent l'état.
 *
 * Atomicité : un seul `INSERT ... ON CONFLICT DO UPDATE` incrémente/réinitialise
 * la fenêtre en une instruction (verrou de ligne) → pas de race.
 *
 * Résilience : si la BDD est indisponible (cold-start, panne), on RETOMBE sur
 * un compteur mémoire local (fail-open partiel) plutôt que de bloquer tout le
 * monde ou d'ouvrir grand les vannes.
 */
import { prisma } from "@/lib/prisma";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Vérifie et incrémente le compteur d'une clé. Fenêtre glissante approximative :
 * un compteur par clé qui se réinitialise à `resetAt`.
 */
export async function checkRateLimit(
  key: string,
  options: { max: number; windowMs: number }
): Promise<RateLimitResult> {
  const resetAtNew = new Date(Date.now() + options.windowMs);
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO rate_limit_buckets (key, count, "resetAt")
      VALUES (${key}, 1, ${resetAtNew})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets."resetAt" <= now() THEN 1
                     ELSE rate_limit_buckets.count + 1 END,
        "resetAt" = CASE WHEN rate_limit_buckets."resetAt" <= now() THEN ${resetAtNew}
                         ELSE rate_limit_buckets."resetAt" END
      RETURNING count, "resetAt"
    `;
    const row = rows[0];
    const count = Number(row.count);
    const resetAt = row.resetAt.getTime();
    if (count > options.max) {
      return { allowed: false, remaining: 0, resetAt };
    }
    return { allowed: true, remaining: options.max - count, resetAt };
  } catch (e) {
    console.error("[rate-limit] BDD indisponible → fallback mémoire:", e);
    return checkRateLimitMemory(key, options);
  }
}

/** Purge les compteurs expirés (appelé par le cron keepalive). */
export async function cleanupExpiredRateLimits(): Promise<number> {
  try {
    const res = await prisma.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: new Date() } },
    });
    return res.count;
  } catch {
    return 0;
  }
}

/**
 * Extrait l'IP cliente d'une Request Next.js.
 * Lit les en-têtes de proxy classiques (Vercel, Netlify, Cloudflare).
 * Fallback : "unknown" si rien — toutes les requêtes "unknown" partagent alors
 * le bucket (acceptable pour un endpoint public).
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// ─── Fallback mémoire (utilisé uniquement si la BDD est indisponible) ────────
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function checkRateLimitMemory(
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

// Nettoyage périodique des buckets mémoire expirés (fallback uniquement).
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
if (typeof setInterval !== "undefined" && !cleanupTimer) {
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  if (typeof cleanupTimer === "object" && cleanupTimer && "unref" in cleanupTimer) {
    (cleanupTimer as { unref: () => void }).unref();
  }
}
