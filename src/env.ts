/**
 * Validation centralisée des variables d'environnement.
 * Importé tôt (auth.ts, prisma.ts) pour fail-fast au démarrage si une
 * variable manque ou est mal formée. Évite les "erreurs cryptiques en prod".
 *
 * Convention : on distingue ce qui est REQUIS en prod de ce qui est optionnel.
 * Les variables "soft" (Resend, etc.) restent optionnelles et leur absence
 * est gérée avec un fallback (console.warn dans email.ts).
 */
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ─── Mode démo ───
  // Doit rester à 0 en prod (vérification redondante avec auth.ts mais utile
  // pour intercepter les démarrages locaux mal configurés).
  DEMO_MODE: z.enum(["0", "1"]).default("0"),

  // ─── Base de données ───
  DATABASE_URL: z
    .string()
    .url()
    .refine((u) => u.startsWith("postgres"), "DATABASE_URL doit être un postgres://"),
  DIRECT_URL: z.string().url().optional(),

  // ─── NextAuth ───
  // Au moins une des deux variables doit être définie ; en prod on impose
  // une longueur ≥ 32 et une valeur non par défaut.
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // ─── Resend (optionnel) ───
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")} : ${i.message}`)
    .join("\n");
  throw new Error(
    `[env] Variables d'environnement invalides :\n${issues}\n\n` +
      `Vérifie ton .env (cf. .env.example).`
  );
}

const env = parsed.data;

// ─── Garde-fous prod renforcés ───
if (isProd) {
  if (env.DEMO_MODE === "1") {
    throw new Error(
      "[env] DEMO_MODE=1 est INTERDIT en production (bypass d'authentification)."
    );
  }
  const secret = env.NEXTAUTH_SECRET ?? env.AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.includes("please-change") || secret.includes("votre-secret")) {
    throw new Error(
      "[env] NEXTAUTH_SECRET/AUTH_SECRET manquant ou trop faible. " +
        "Génère-le avec `openssl rand -base64 32` et configure-le côté hébergement."
    );
  }
}

export { env };
