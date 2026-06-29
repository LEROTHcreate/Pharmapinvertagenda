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

  // ─── Supabase Auth ───
  // Identité gérée par Supabase Auth. Requis en prod (validé plus bas) ;
  // optionnel en dev/test pour ne pas bloquer les outils hors-ligne.
  // On accepte les deux conventions : ancienne (anon/service_role) et
  // nouvelle (publishable/secret, format sb_publishable_… / sb_secret_…).
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),

  // ─── URL publique (liens emails, redirections) ───
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
  // Supabase Auth requis en prod (identité + mots de passe). On accepte l'une
  // ou l'autre convention de nommage pour la clé publique et la clé secrète.
  const publicKey =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const missing = [
    !env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !publicKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY (ou _PUBLISHABLE_KEY)",
    !secretKey && "SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY)",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `[env] Variables Supabase Auth manquantes en production : ${missing.join(", ")}. ` +
        "Récupère-les dans Supabase → Project Settings → API."
    );
  }
}

export { env };
