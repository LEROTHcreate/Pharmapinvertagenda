/**
 * One-shot : set le logoUrl de la pharmacie matchant "pinvert" → "/logo.png".
 * Utilise SQL brut pour contourner un client Prisma non-régénéré.
 *
 * Usage : npx tsx scripts/set-pinvert-logo-raw.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE pharmacies SET "logoUrl" = '/logo.png' WHERE name ILIKE '%pin vert%'`
    );
    console.log(`✓ ${result} pharmacie(s) mise(s) à jour avec /logo.png`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
