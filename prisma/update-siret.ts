/**
 * Script ponctuel : met à jour le SIRET de la "Pharmacie du Pinvert" en BDD.
 *
 * Lancement :
 *   DATABASE_URL="<URL prod>" DIRECT_URL="<URL prod>" npx tsx prisma/update-siret.ts
 *
 * Idempotent : si le SIRET est déjà à jour, ne fait rien.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_NAME_HINT = "pinvert"; // matche "Pharmacie du Pinvert" / "PinVert" / etc. (case-insensitive)
const NEW_SIRET = "79889859900013"; // 14 chiffres, espaces retirés

async function main() {
  // Trouve la pharmacie par nom approximatif (case-insensitive contient "pinvert")
  const pharmacies = await prisma.pharmacy.findMany({
    select: { id: true, name: true, siret: true },
  });
  const target = pharmacies.find((p) =>
    p.name.toLowerCase().includes(TARGET_NAME_HINT)
  );

  if (!target) {
    console.error(
      `❌ Aucune pharmacie trouvée contenant "${TARGET_NAME_HINT}" dans son nom.`
    );
    console.error("Pharmacies en BDD :");
    for (const p of pharmacies) {
      console.error(`  - ${p.id} · ${p.name} · siret=${p.siret ?? "null"}`);
    }
    process.exit(1);
  }

  if (target.siret === NEW_SIRET) {
    console.log(
      `✓ ${target.name} a déjà le bon SIRET (${NEW_SIRET}). Rien à faire.`
    );
    return;
  }

  console.log(
    `→ Mise à jour SIRET pour "${target.name}" : ${target.siret ?? "null"} → ${NEW_SIRET}`
  );
  await prisma.pharmacy.update({
    where: { id: target.id },
    data: { siret: NEW_SIRET },
  });
  console.log(`✓ SIRET mis à jour avec succès.`);
}

main()
  .catch((e) => {
    console.error("Erreur :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
