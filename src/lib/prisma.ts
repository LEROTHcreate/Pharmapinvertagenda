import { PrismaClient } from "@prisma/client";
import { createMockPrisma } from "./mock-prisma";
// Side-effect : valide les env vars au démarrage (fail-fast).
import "@/env";

// DEMO_MODE refusé en prod : si la variable arrive en prod par erreur (ex. sur
// Netlify), on ignore — sinon le mock Prisma + l'auth bypass exposeraient
// l'application au monde entier.
const isDemoMode =
  process.env.DEMO_MODE === "1" && process.env.NODE_ENV !== "production";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaDirect?: PrismaClient;
};

function makeClient(): PrismaClient {
  if (isDemoMode) {
    // Mock minimal — l'app n'utilise qu'un sous-ensemble de l'API Prisma
    return createMockPrisma() as unknown as PrismaClient;
  }

  // Même problème de saturation que prismaDirect, côté client PRINCIPAL
  // (DATABASE_URL, pooler en mode transaction, port 6543) : sans plafond,
  // Prisma ouvre ~5 connexions par instance de lambda → une poignée de lambdas
  // concurrentes suffit à atteindre la limite de connexions clientes du pooler
  // Supabase (Supavisor : `EMAXCONN: max client connections reached, limit: 200`),
  // ce qui fait planter les pages en 500 par intermittence. On borne à 1
  // connexion par instance ; `pool_timeout` laisse le temps de l'obtenir sous
  // charge. On ne surcharge que si l'URL ne fixe pas déjà ces paramètres.
  const raw = process.env.DATABASE_URL;
  let url: string | undefined = raw;
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (!parsed.searchParams.has("connection_limit")) {
        parsed.searchParams.set("connection_limit", "1");
      }
      if (!parsed.searchParams.has("pool_timeout")) {
        parsed.searchParams.set("pool_timeout", "15");
      }
      url = parsed.toString();
    } catch {
      // URL non parsable (caractères spéciaux non encodés) : on garde l'URL
      // d'origine plutôt que de risquer une régression de connexion.
      url = raw;
    }
  }

  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Client Prisma qui parle DIRECTEMENT à Postgres (port 5432) sans passer
 * par pgbouncer. À utiliser UNIQUEMENT pour les opérations bulk
 * (createMany, deleteMany massifs) qui souffrent de l'overhead pgbouncer
 * en mode transaction.
 *
 * - Si `DIRECT_URL` n'est pas défini → fallback sur le client standard
 *   (pas de gain mais pas de régression).
 * - Si `DEMO_MODE` → utilise le mock comme le client standard.
 *
 * ⚠ Ne pas utiliser pour les requêtes simples : pgbouncer reste
 * préférable car il pool les connexions (essentiel en serverless).
 */
function makeDirectClient(): PrismaClient {
  if (isDemoMode) return prisma;
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) return prisma; // Pas de DIRECT_URL → fallback

  // DIRECT_URL vise le pooler en mode SESSION (port 5432) : chaque connexion
  // ouverte consomme une vraie connexion Postgres tant que le client vit. En
  // serverless, sans plafond, chaque instance ouvre plusieurs connexions
  // (défaut Prisma ≈ 2·CPU+1) qui s'accumulent → limite Supabase (200) atteinte
  // → FATAL EMAXCONN sur TOUTES les requêtes. On borne donc à 1 connexion par
  // instance : le POST planning enchaîne deleteMany puis createMany en série,
  // 1 suffit. `pool_timeout` laisse le temps d'obtenir la connexion.
  const url = new URL(directUrl);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "1");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "15");
  }

  return new PrismaClient({
    datasources: { db: { url: url.toString() } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prismaDirect: PrismaClient =
  globalForPrisma.prismaDirect ?? makeDirectClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaDirect = prismaDirect;
}
