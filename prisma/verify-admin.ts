/**
 * Script de diagnostic : vérifie que le compte admin existe en BDD
 * et que le mot de passe `fondationthor!` matche bien le hash stocké.
 *
 * Lancement : npx tsx prisma/verify-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "pharmapinvert.agenda@gmail.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "fondationthor!";

  console.log(`→ Recherche du compte ${email}...`);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`✗ Aucun compte trouvé avec cet email.`);
    const all = await prisma.user.findMany({
      select: { id: true, email: true, role: true, status: true, isActive: true },
    });
    console.log(`\n→ Comptes existants en BDD :`);
    console.table(all);
    process.exit(1);
  }

  console.log(`✓ Compte trouvé`);
  console.log(`  ID         : ${user.id}`);
  console.log(`  Email      : ${user.email}`);
  console.log(`  Name       : ${user.name}`);
  console.log(`  Role       : ${user.role}`);
  console.log(`  Status     : ${user.status}`);
  console.log(`  isActive   : ${user.isActive}`);
  console.log(`  hashLength : ${user.hashedPassword.length} chars`);

  console.log(`\n→ Test du mot de passe "${password}" contre le hash stocké...`);
  const ok = await bcrypt.compare(password, user.hashedPassword);
  if (ok) {
    console.log(`✓ Le mot de passe MATCH. Tu peux te connecter.`);
  } else {
    console.error(`✗ Le mot de passe NE MATCHE PAS. Le hash stocké correspond à un autre mot de passe.`);
    console.log(`\nFix : relance \`npx tsx prisma/update-admin.ts\` pour mettre à jour.`);
  }

  // Diagnostic auth
  if (!user.isActive || user.status !== "APPROVED") {
    console.error(
      `\n⚠ Le compte est ${user.status} / isActive=${user.isActive} → NextAuth refusera la connexion même avec le bon mot de passe.`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
