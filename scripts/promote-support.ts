/**
 * Marque (ou démarque) un compte utilisateur comme "Support PharmaPlanning".
 *
 * Un compte support apparaît comme contact dans la messagerie de toutes
 * les pharmacies, et peut accéder aux conversations dont il est membre
 * peu importe la pharmacie d'origine. Permet aux utilisateurs de toutes
 * les officines d'écrire au programmeur du site pour signaler bugs ou
 * poser des questions.
 *
 * Usage :
 *   npx tsx scripts/promote-support.ts <email>          # active le flag
 *   npx tsx scripts/promote-support.ts <email> --off    # le retire
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  const off = args.includes("--off");

  if (!email) {
    console.error(
      "Usage: npx tsx scripts/promote-support.ts <email> [--off]"
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, isGlobalSupport: true },
    });
    if (!user) {
      console.error(`Aucun compte trouvé pour ${email}`);
      process.exit(2);
    }

    const next = !off;
    if (user.isGlobalSupport === next) {
      console.log(
        `Le compte ${user.email} est déjà ${next ? "marqué" : "non marqué"} support — rien à faire.`
      );
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isGlobalSupport: next },
    });
    console.log(
      next
        ? `✓ ${user.name} (${user.email}) est maintenant le compte Support PharmaPlanning.`
        : `✓ Flag support retiré pour ${user.name} (${user.email}).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
