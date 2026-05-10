/**
 * Routeur de seeds PharmaPlanning.
 *
 * Dispatche vers le bon fichier `prisma/seeds/<id>.ts` selon le 1er
 * argument CLI. Sans argument : défaut sur "pin-vert" pour préserver
 * `npm run db:seed` historique.
 *
 *  - `pin-vert`    → restaure la pharmacie de démo + 17 employés + 2 semaines
 *                    de planning. Idempotent (purge avant insert).
 *  - `template`    → crée une nouvelle pharmacie vide + 1 admin. Voir
 *                    `prisma/seeds/template.ts` pour les flags requis.
 *
 *  Usage :
 *    npm run db:seed                    (défaut → pin-vert)
 *    npm run db:seed pin-vert
 *    npm run db:seed template -- --name "Pharmacie X" --email admin@x.fr
 */
import { PrismaClient } from "@prisma/client";
import { seedPinVert } from "./seeds/pin-vert";
import { seedTemplate, type TemplateSeedOptions } from "./seeds/template";

function parseTemplateArgs(argv: string[]): TemplateSeedOptions {
  const out: Partial<TemplateSeedOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--name" && next) out.name = next;
    else if (a === "--email" && next) out.email = next;
    else if (a === "--password" && next) out.password = next;
    else if (a === "--address" && next) out.address = next;
    else if (a === "--phone" && next) out.phone = next;
    else if (a === "--siret" && next) out.siret = next;
    else if (a === "--min-staff" && next) out.minStaff = Number(next);
  }
  if (!out.name || !out.email) {
    console.error(
      'Pour le seed "template", il faut au minimum --name et --email.\n' +
        'Ex: npm run db:seed template -- --name "Pharmacie X" --email admin@x.fr'
    );
    process.exit(1);
  }
  return out as TemplateSeedOptions;
}

async function main() {
  const argv = process.argv.slice(2);
  const target = argv[0] ?? "pin-vert";
  const prisma = new PrismaClient();

  try {
    switch (target) {
      case "pin-vert":
        await seedPinVert(prisma);
        break;
      case "template":
        await seedTemplate(prisma, parseTemplateArgs(argv.slice(1)));
        break;
      default:
        console.error(
          `Seed inconnu : "${target}". Choix valides : pin-vert, template.`
        );
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
