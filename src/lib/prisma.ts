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
  return new PrismaClient({
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
  return new PrismaClient({
    datasources: { db: { url: directUrl } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prismaDirect: PrismaClient =
  globalForPrisma.prismaDirect ?? makeDirectClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaDirect = prismaDirect;
}
