import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; logoUrl: string | null }>>(
      `SELECT id, name, "logoUrl" FROM pharmacies ORDER BY name`
    );
    console.log(`Total: ${rows.length} pharmacie(s)`);
    for (const r of rows) {
      console.log(`  - ${r.name}  [logoUrl: ${r.logoUrl ?? "(null)"}]`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
