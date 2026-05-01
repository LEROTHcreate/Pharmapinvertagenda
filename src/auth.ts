import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const isDemoMode = process.env.DEMO_MODE === "1";

// ─── Garde-fous d'environnement ─────────────────────────────────
// 1. Bloque DEMO_MODE en production : sinon, n'importe qui voit une session
//    admin factice (bypass complet d'authentification).
// 2. Refuse de démarrer en prod sans NEXTAUTH_SECRET / AUTH_SECRET réel :
//    sans secret, les JWT sont forgeables → un attaquant peut se forger
//    une session ADMIN pour n'importe quelle pharmacie.
if (process.env.NODE_ENV === "production") {
  if (isDemoMode) {
    throw new Error(
      "[auth] DEMO_MODE=1 est interdit en production (bypass d'authentification)."
    );
  }
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.includes("please-change")) {
    throw new Error(
      "[auth] NEXTAUTH_SECRET/AUTH_SECRET manquant ou trop faible. Génère-le avec `openssl rand -base64 32` et configure-le côté Netlify."
    );
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const nextAuth = NextAuth({
  ...authConfig,
  // Netlify (et autres reverse proxies) modifient les headers Host/X-Forwarded.
  // `trustHost: true` désactive la vérification stricte de l'host : utile
  // car NextAuth, sinon, refuse les requêtes dont l'host ne matche pas
  // exactement NEXTAUTH_URL (problème classique en serverless behind un CDN).
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(creds) {
        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;

        // ─── Rate-limit anti brute-force ───
        // 10 tentatives / 15 min par email + 30 / 15 min par IP (en best-effort,
        // l'IP n'est pas toujours dispo dans authorize()). Bloque les attaques
        // simples sans gêner l'utilisateur normal.
        const { checkRateLimit } = await import("@/lib/rate-limit");
        const emailKey = `login:email:${parsed.data.email.toLowerCase()}`;
        const limit = checkRateLimit(emailKey, {
          max: 10,
          windowMs: 15 * 60 * 1000,
        });
        if (!limit.allowed) {
          // Refus silencieux : on log côté serveur sans révéler à l'attaquant
          // que l'email est rate-limited (différence comportementale = info
          // exploitable pour énumération).
          console.warn(`[auth] login rate-limited for ${parsed.data.email}`);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        // Refus silencieux si compte inexistant, désactivé, ou non approuvé.
        // (On évite l'énumération d'emails et la divulgation du statut.)
        if (!user || !user.isActive || user.status !== "APPROVED") return null;

        const ok = await bcrypt.compare(
          parsed.data.password,
          user.hashedPassword
        );
        if (!ok) return null;

        // Trace la connexion pour audit (best-effort : on ne bloque pas la
        // connexion si l'écriture échoue).
        prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch((e) => {
            console.error("[auth] échec mise à jour lastLoginAt:", e);
          });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          pharmacyId: user.pharmacyId,
          employeeId: user.employeeId,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.pharmacyId = user.pharmacyId;
        token.employeeId = user.employeeId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.pharmacyId = token.pharmacyId;
        session.user.employeeId = token.employeeId;
      }
      return session;
    },
  },
});

export const handlers = nextAuth.handlers;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;

// Session factice utilisée en mode démo
const demoSession = {
  user: {
    id: "user-admin",
    email: "admin@pharmacie-demo.fr",
    name: "Agnès Bertrand (démo)",
    role: "ADMIN" as const,
    pharmacyId: "demo-pharmacy",
    employeeId: "emp-1",
  },
  expires: new Date(Date.now() + 86400000 * 30).toISOString(),
};

export const auth: typeof nextAuth.auth = (isDemoMode
  ? (async () => demoSession)
  : nextAuth.auth) as typeof nextAuth.auth;
