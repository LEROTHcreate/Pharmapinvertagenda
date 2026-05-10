import type { NextAuthConfig } from "next-auth";

/**
 * Config Auth.js partagée — sans accès BDD ni bcrypt (compatible Edge / middleware).
 * Les providers et callbacks lourds sont définis dans `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const isOnLogin = path.startsWith("/login");
      const isOnSignup = path.startsWith("/signup");
      const isOnForgot = path.startsWith("/forgot-password");
      const isOnReset = path.startsWith("/reset-password");
      const isOnHome = path === "/"; // landing page produit
      const isOnApi = path.startsWith("/api");

      if (isOnApi) return true; // chaque route API gère son auth

      // Landing page racine : publique. La page elle-même redirige les
      // utilisateurs déjà connectés vers /planning, donc on laisse passer.
      if (isOnHome) return true;

      // Pages publiques (auth) : accessibles sans session ;
      // utilisateur déjà connecté → redirigé vers le planning.
      if (isOnLogin || isOnSignup || isOnForgot || isOnReset) {
        if (isLoggedIn) return Response.redirect(new URL("/planning", nextUrl));
        return true;
      }
      // Toute autre page nécessite une session
      if (!isLoggedIn) return false;
      return true;
    },
  },
  providers: [], // injectés dans auth.ts
} satisfies NextAuthConfig;
