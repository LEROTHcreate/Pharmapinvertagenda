#!/usr/bin/env node
/**
 * Garde-fou déploiement — détecte une DÉRIVE entre `prisma/schema.prisma` et la
 * base (par défaut : la prod via DIRECT_URL) AVANT de déployer, et la CLASSE :
 *
 *   ✅  en sync            → rien à faire
 *   ⚠️  additif (sûr)      → le build appliquera (CREATE/ADD) sans souci
 *   🛑  destructif         → `prisma db push` du build ÉCHOUERA (perte de
 *                            données refusée sans --accept-data-loss) → à
 *                            résoudre EN BASE avant de déployer
 *
 * Pourquoi : le build fait `prisma db push` (sans --accept-data-loss). Si un
 * champ retiré du schéma existe encore en base (ex. `fromOpenShift`), TOUS les
 * déploiements de la branche échouent cryptiquement. Ce script attrape le cas
 * en 2 s en local (verdict clair) plutôt qu'après 2 min de build raté.
 *
 * Usage :  npm run db:check                 (compare au schéma vs DIRECT_URL)
 *          node scripts/db-drift-check.mjs   (idem)
 * Exit code : 0 (sync/additif) · 1 (destructif) · 2 (erreur d'exécution).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Récupère une variable d'env, ou la lit dans un .env local à défaut. */
function readEnv(name) {
  if (process.env[name]) return process.env[name];
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/**
 * Entrée JS de la CLI prisma. On l'appelle via `node <entry>` (et non le
 * wrapper .bin) pour rester cross-plateforme : sur Windows, execFileSync ne
 * sait pas lancer un .cmd (EINVAL) ; passer par le .js évite aussi tout
 * problème de guillemets sur l'URL (args transmis sans shell).
 */
function prismaEntry() {
  const entry = join(ROOT, "node_modules", "prisma", "build", "index.js");
  if (!existsSync(entry)) {
    console.error("🛑 CLI prisma introuvable (node_modules/prisma/build/index.js).");
    process.exit(2);
  }
  return entry;
}

const dbUrl = readEnv("DIRECT_URL") ?? readEnv("DATABASE_URL");
if (!dbUrl) {
  console.error(
    "🛑 Ni DIRECT_URL ni DATABASE_URL trouvés (env ou .env). Impossible de vérifier la base."
  );
  process.exit(2);
}

let sql = "";
try {
  sql = execFileSync(
    process.execPath, // node
    [
      prismaEntry(),
      "migrate",
      "diff",
      "--from-url",
      dbUrl,
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
} catch (err) {
  console.error("🛑 Échec de `prisma migrate diff` :", err?.message ?? err);
  process.exit(2);
}

const isEmpty = /This is an empty migration\./i.test(sql) || sql.trim() === "";
if (isEmpty) {
  console.log("✅ Base en SYNC avec le schéma. Déploiement sans risque de dérive.");
  process.exit(0);
}

// Lignes SQL réelles (on ignore commentaires et lignes vides).
const stmts = sql
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("--"));

// Motifs qui font ÉCHOUER `db push` sans --accept-data-loss (perte de données).
const DESTRUCTIVE =
  /\bDROP\s+(TABLE|COLUMN)\b|\bDROP\s+TYPE\b|\bSET\s+NOT\s+NULL\b|\bALTER\s+COLUMN\b.*\bTYPE\b/i;
const destructive = stmts.filter((s) => DESTRUCTIVE.test(s));

console.log("\n── Dérive schéma ↔ base ──────────────────────────────\n");
for (const s of stmts) console.log("  " + s);
console.log("");

if (destructive.length > 0) {
  console.error(
    "🛑 DESTRUCTIF — le `prisma db push` du build VA ÉCHOUER (perte de données\n" +
      "   refusée sans --accept-data-loss). NE DÉPLOIE PAS tel quel.\n\n" +
      "   Instructions destructives détectées :\n" +
      destructive.map((s) => "     • " + s).join("\n") +
      "\n\n   À faire : vérifie que ces colonnes/tables sont bien inutilisées par le\n" +
      "   code (tsc passe sans), puis applique-les EN BASE avec, par ex. :\n" +
      "     prisma db execute --url \"$DIRECT_URL\" --file drop.sql\n" +
      "   (voir la mémoire projet « ordre schéma Prisma ↔ deploy »).\n"
  );
  process.exit(1);
}

console.log(
  "⚠️  ADDITIF uniquement (CREATE / ADD) — SANS perte de données.\n" +
    "   Le `prisma db push` du build appliquera ces changements automatiquement.\n" +
    "   Déploiement OK.\n"
);
process.exit(0);
