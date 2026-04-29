/**
 * Script ponctuel : met à jour l'email + mot de passe de l'admin de démo
 * SANS toucher aux autres comptes ni aux données planning.
 *
 * Lancement : npx tsx prisma/update-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const NEW_EMAIL = "pharmapinvert.agenda@gmail.com";
// ⚠ Pas de mot de passe en clair (Netlify secret scan).
// Lance avec : SEED_ADMIN_PASSWORD=monMdp npx tsx prisma/update-admin.ts
const NEW_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const OLD_EMAIL = "admin@pharmacie-demo.fr";

async function main() {
  if (!NEW_PASSWORD) {
    console.error(
      "✗ SEED_ADMIN_PASSWORD non défini. Lance avec :\n" +
        "  SEED_ADMIN_PASSWORD='tonMotDePasse' npx tsx prisma/update-admin.ts"
    );
    process.exit(1);
  }
  console.log(`→ Recherche du compte admin existant...`);

  // Cherche le compte admin par son ID démo OU par son ancien email
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { id: "user-demo-admin" },
        { email: OLD_EMAIL },
        { email: NEW_EMAIL },
      ],
      role: "ADMIN",
    },
  });

  if (!existing) {
    console.error(
      `✗ Aucun compte admin trouvé (ni "${OLD_EMAIL}" ni "${NEW_EMAIL}", ni id "user-demo-admin").`
    );
    console.error(
      `  Lance d'abord 'npm run db:seed' pour créer le compte de base.`
    );
    process.exit(1);
  }

  // Vérifie qu'on n'écrase pas un autre compte qui aurait déjà ce nouvel email
  if (existing.email !== NEW_EMAIL) {
    const conflict = await prisma.user.findUnique({
      where: { email: NEW_EMAIL },
      select: { id: true },
    });
    if (conflict && conflict.id !== existing.id) {
      console.error(
        `✗ Un autre compte utilise déjà l'email "${NEW_EMAIL}" — annulation.`
      );
      process.exit(1);
    }
  }

  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      email: NEW_EMAIL,
      hashedPassword,
      // Garantit qu'il est bien APPROVED + actif (en cas de reset)
      status: "APPROVED",
      isActive: true,
      reviewedAt: new Date(),
    },
  });

  console.log(`✓ Compte admin mis à jour :`);
  console.log(`  Email    : ${NEW_EMAIL}`);
  console.log(`  Password : ${NEW_PASSWORD}`);
  console.log(``);
  console.log(`Tu peux maintenant te connecter avec ces identifiants.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
