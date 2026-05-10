/**
 * Seed "template" — initialise une nouvelle pharmacie minimaliste, prête
 * à être enrichie par son admin via l'interface (Équipe, Gabarits, etc.).
 *
 *  - 1 pharmacie (paramétrée via flags)
 *  - 1 compte admin (titulaire) avec un mot de passe temporaire
 *  - PAS d'employés ni de planning : l'admin ajoute son équipe à la main
 *
 *  Idempotent par email admin : si le compte existe déjà, met à jour la
 *  pharmacie associée plutôt que d'en créer une nouvelle.
 *
 *  Usage standalone :
 *    npx tsx prisma/seeds/template.ts \
 *      --name "Pharmacie des Lilas" \
 *      --email titulaire@lilas.fr \
 *      [--password "TempPass123"] \
 *      [--address "..."] [--phone "..."] [--siret "..."]
 *
 *  Usage via le router :
 *    npm run db:seed template -- --name ... --email ...
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export type TemplateSeedOptions = {
  name: string;
  email: string;
  /** Mot de passe en clair — sera bcrypt-hashé. Génère un mdp aléatoire si absent. */
  password?: string;
  address?: string;
  phone?: string;
  siret?: string;
  /** Seuil min d'effectif comptoir (défaut 4). */
  minStaff?: number;
};

function randomPassword(length = 14): string {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!#$%&*";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += charset[Math.floor(Math.random() * charset.length)];
  }
  return out;
}

/**
 * Crée (ou met à jour) une pharmacie vide + son compte admin.
 * Retourne l'id de la pharmacie et le mdp en clair (à transmettre à
 * l'admin pour sa première connexion).
 */
export async function seedTemplate(
  prisma: PrismaClient,
  opts: TemplateSeedOptions
): Promise<{ pharmacyId: string; adminPassword: string; created: boolean }> {
  const password = opts.password ?? randomPassword();
  const hashed = await bcrypt.hash(password, 10);

  // Email de l'admin = clé d'idempotence : si un User avec cet email existe
  // déjà, on réutilise sa pharmacie au lieu d'en créer une nouvelle.
  const existing = await prisma.user.findUnique({
    where: { email: opts.email },
    select: { id: true, pharmacyId: true },
  });

  if (existing) {
    await prisma.pharmacy.update({
      where: { id: existing.pharmacyId },
      data: {
        name: opts.name,
        address: opts.address ?? null,
        phone: opts.phone ?? null,
        siret: opts.siret ?? null,
        minStaff: opts.minStaff ?? 4,
      },
    });
    console.log(
      `✓ Pharmacie "${opts.name}" mise à jour (admin existant : ${opts.email}).`
    );
    return { pharmacyId: existing.pharmacyId, adminPassword: "", created: false };
  }

  const pharmacy = await prisma.pharmacy.create({
    data: {
      name: opts.name,
      address: opts.address ?? null,
      phone: opts.phone ?? null,
      siret: opts.siret ?? null,
      minStaff: opts.minStaff ?? 4,
    },
  });

  await prisma.user.create({
    data: {
      email: opts.email,
      hashedPassword: hashed,
      // Convention : on ne connaît pas le nom complet — l'admin le complète
      // depuis son profil après la 1re connexion.
      name: opts.email.split("@")[0],
      role: "ADMIN",
      status: "APPROVED",
      reviewedAt: new Date(),
      pharmacyId: pharmacy.id,
      employeeId: null,
    },
  });

  console.log(
    `✓ Pharmacie "${opts.name}" créée (id: ${pharmacy.id}).\n` +
      `  Admin : ${opts.email}\n` +
      `  Mot de passe initial : ${password}\n` +
      `  À transmettre à l'admin pour sa 1re connexion.`
  );

  return { pharmacyId: pharmacy.id, adminPassword: password, created: true };
}

// ─── CLI standalone ──────────────────────────────────────────────

function parseArgs(argv: string[]): TemplateSeedOptions {
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
      "Usage: npx tsx prisma/seeds/template.ts --name \"Pharmacie X\" --email admin@x.fr [--password ...]"
    );
    process.exit(1);
  }
  return out as TemplateSeedOptions;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  seedTemplate(prisma, args)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      void prisma.$disconnect();
    });
}
