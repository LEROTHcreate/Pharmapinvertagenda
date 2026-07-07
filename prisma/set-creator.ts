/**
 * Script ponctuel : élève le compte pharmapinvert.agenda@gmail.com au rôle
 * CREATEUR (tous les droits + intouchable : personne ne peut le rétrograder,
 * le désactiver ni le supprimer via l'application — cf. canManageUser).
 *
 * Lancement : npx tsx prisma/set-creator.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL = "pharmapinvert.agenda@gmail.com";

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, name: true, role: true, status: true, isActive: true },
  });

  if (!existing) {
    console.error(`✗ Aucun compte avec l'email "${EMAIL}".`);
    console.error(`  Le compte doit d'abord exister (inscription / seed).`);
    process.exit(1);
  }

  console.log(`→ Compte trouvé : ${existing.name} (${EMAIL})`);
  console.log(`  Rôle actuel : ${existing.role} · statut ${existing.status} · actif ${existing.isActive}`);

  if (existing.role === "CREATEUR") {
    console.log(`✓ Déjà CREATEUR — rien à faire.`);
    return;
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      role: "CREATEUR",
      status: "APPROVED",
      isActive: true,
    },
  });

  console.log(`✓ Rôle mis à jour : ${existing.role} → CREATEUR`);
  console.log(`  Ce compte a désormais tous les droits et ne peut plus être`);
  console.log(`  rétrogradé / désactivé / supprimé depuis l'application.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
