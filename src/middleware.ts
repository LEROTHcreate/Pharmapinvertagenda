import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/keys";

// DEMO_MODE refusé en prod (sinon bypass de toute l'auth).
const isDemoMode =
  process.env.DEMO_MODE === "1" && process.env.NODE_ENV !== "production";

/**
 * Middleware Supabase Auth :
 *  1. rafraîchit la session (rotation des cookies) à chaque requête ;
 *  2. applique le gating de routes (équivalent de l'ancien
 *     `authConfig.authorized`).
 *
 * Note : le middleware tourne sur l'edge runtime → pas d'accès Prisma. Le gate
 * "session présente" suffit ici ; le gate métier (compte APPROVED/actif) est
 * appliqué par `auth()` dans les layouts/pages/routes (cf. dashboard layout).
 */
export async function middleware(request: NextRequest) {
  if (isDemoMode) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT : getUser() (et non getSession) pour valider le token et
  // déclencher le rafraîchissement des cookies si besoin.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  const path = request.nextUrl.pathname;
  const isOnApi = path.startsWith("/api");
  const isOnHome = path === "/";
  const isOnPublicAuth =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password");

  // Les routes API gèrent leur propre auth ; la landing est publique.
  if (isOnApi || isOnHome) return response;

  // Pages publiques d'auth : si déjà connecté → vers le planning.
  if (isOnPublicAuth) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/planning", request.nextUrl));
    }
    return response;
  }

  // Toute autre page exige une session ; sinon → /login (avec callbackUrl).
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.png|demo).*)"],
};
