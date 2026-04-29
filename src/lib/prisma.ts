import { PrismaClient } from "@prisma/client";
import { createMockPrisma } from "./mock-prisma";
// Side-effect : valide les env vars au démarrage (fail-fast).
import "@/env";

// DEMO_MODE refusé en prod : si la variable arrive en prod par erreur (ex. sur
// Netlify), on ignore — sinon le mock Prisma + l'auth bypass exposeraient
// l'application au monde entier.
const isDemoMode =
  process.env.DEMO_MODE === "1" && process.env.NODE_ENV !== "production";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

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
