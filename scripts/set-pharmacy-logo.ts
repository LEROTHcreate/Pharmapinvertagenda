/**
 * Définit (ou retire) le logo d'une pharmacie en BDD.
 *
 * Usage :
 *   npx tsx scripts/set-pharmacy-logo.ts <pharmacy_name_match> <logo_url>
 *   npx tsx scripts/set-pharmacy-logo.ts <pharmacy_name_match> --clear
 *
 * Le `pharmacy_name_match` est une recherche `contains` insensible à la
 * casse. Ex: "pinvert" matche "Pharmacie du Pin Vert".
 *
 * Le `logo_url` peut être :
 *   - Un chemin relatif (ex: "/logo.png") — fichier servi depuis /public
 *   - Une data URL base64 (ex: "data:image/png;base64,...") — stocké en BDD
 *   - Une URL externe (déconseillé, dépend d'un tiers)
 *
 * Exemple Pinvert (restaurer son logo d'origine) :
 *   npx tsx scripts/set-pharmacy-logo.ts pinvert /logo.png
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const args = process.argv.slice(2);
  const nameMatch = args[0];
  const second = args[1];

  if (!nameMatch || !second) {
    console.error(
      "Usage: npx tsx scripts/set-pharmacy-logo.ts <pharmacy_name_match> <logo_url|--clear>"
    );
    process.exit(1);
  }

  const clear = second === "--clear";
  const logoUrl = clear ? null : second;

  const prisma = new PrismaClient();
  try {
    const matches = await prisma.pharmacy.findMany({
      where: { name: { contains: nameMatch, mode: "insensitive" } },
      select: { id: true, name: true, logoUrl: true },
    });

    if (matches.length === 0) {
      console.error(`Aucune pharmacie ne matche "${nameMatch}".`);
      process.exit(2);
    }
    if (matches.length > 1) {
      console.error(
        `Ambigu — ${matches.length} pharmacies matchent "${nameMatch}" :`
      );
      matches.forEach((p) => console.error(`  - ${p.name}`));
      console.error("Précise davantage le nom.");
      process.exit(3);
    }

    const target = matches[0];
    await prisma.pharmacy.update({
      where: { id: target.id },
      data: { logoUrl },
    });
    console.log(
      clear
        ? `✓ Logo retiré pour "${target.name}".`
        : `✓ Logo défini pour "${target.name}" → ${logoUrl}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
