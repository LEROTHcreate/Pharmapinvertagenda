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
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      const isOnSignup = nextUrl.pathname.startsWith("/signup");
      const isOnApi = nextUrl.pathname.startsWith("/api");

      if (isOnApi) return true; // chaque route API gère son auth
      // Pages publiques (login + signup) : accessibles sans session ;
      // utilisateur déjà connecté → redirigé vers le planning.
      if (isOnLogin || isOnSignup) {
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
