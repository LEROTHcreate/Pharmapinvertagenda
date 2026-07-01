import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { get } from "@vercel/edge-config";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/keys";

// DEMO_MODE refusé en prod (sinon bypass de toute l'auth).
const isDemoMode =
  process.env.DEMO_MODE === "1" && process.env.NODE_ENV !== "production";

// Page de maintenance servie en INLINE (aucune dépendance base/build/asset) →
// fonctionne même si l'app est cassée. CSS inline, icône SVG, ton de la marque.
const MAINTENANCE_HTML = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Maintenance — PharmaPlanning</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
background:linear-gradient(135deg,#eef2ff 0%,#faf5ff 100%);
display:flex;align-items:center;justify-content:center;padding:24px;color:#27272a}
.card{width:100%;max-width:460px;background:rgba(255,255,255,.8);
border:1px solid rgba(255,255,255,.6);border-radius:24px;padding:40px 32px;text-align:center;
box-shadow:0 30px 80px -20px rgba(79,70,229,.18),0 8px 24px -12px rgba(0,0,0,.08);
backdrop-filter:blur(16px)}
.icon{width:56px;height:56px;border-radius:9999px;background:#eef2ff;
display:flex;align-items:center;justify-content:center;margin:0 auto;
box-shadow:inset 0 0 0 1px #e0e7ff}
h1{margin:20px 0 0;font-size:20px;font-weight:600;letter-spacing:-.01em}
p{margin:8px auto 0;max-width:22rem;font-size:14px;line-height:1.6;color:#71717a}
.dot{display:inline-block;width:7px;height:7px;border-radius:9999px;background:#6366f1;
margin-right:7px;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
.tag{margin-top:22px;font-size:12px;color:#a1a1aa}
</style></head><body>
<div class="card">
<div class="icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"
stroke="#4f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
<h1>Maintenance en cours</h1>
<p>PharmaPlanning est temporairement indisponible le temps d'une opération technique. Le service revient très vite — merci de votre patience.</p>
<div class="tag"><span class="dot"></span>Réessayez dans quelques minutes</div>
</div></body></html>`;

/**
 * Lit le flag maintenance dans Edge Config.
 *  1. SDK `@vercel/edge-config` → lecture quasi-instantanée sur l'infra Vercel.
 *  2. Fallback HTTP (API publique Edge Config) si le SDK échoue (ex. hors Vercel).
 * Fail-open seulement si les DEUX échouent : un souci de lecture NE doit jamais
 * bloquer le site, mais on évite de rater l'activation à cause d'un SDK capricieux.
 */
// PERF : cache mémoire du flag (persiste sur une instance edge chaude) →
// on ne relit PLUS Edge Config à CHAQUE navigation, juste toutes les ~30 s.
// Contrepartie : une bascule maintenance met jusqu'à 30 s à se propager, ce
// qui est acceptable pour ce cas d'usage.
let maintCache: { value: boolean; ts: number } | null = null;
const MAINT_TTL_MS = 30_000;

async function isMaintenanceOn(): Promise<boolean> {
  const now = Date.now();
  if (maintCache && now - maintCache.ts < MAINT_TTL_MS) return maintCache.value;

  let value = false;
  try {
    value = (await get<boolean>("maintenance")) === true;
  } catch {
    // Fallback : conn = https://edge-config.vercel.com/<id>?token=<t>
    const conn = process.env.EDGE_CONFIG;
    if (conn) {
      try {
        const res = await fetch(conn.replace("?", "/item/maintenance?"), {
          cache: "no-store",
        });
        value = res.ok ? (await res.json()) === true : false;
      } catch {
        value = false;
      }
    }
  }
  maintCache = { value, ts: now };
  return value;
}

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
  // ─── Coupe-circuit maintenance (AVANT tout appel Supabase) ───
  // Sert une page 503 auto-suffisante quand le flag Edge Config est activé.
  // Indépendant de la base et du build → utilisable même quand le site est
  // cassé "d'un coup". Bascule instantanée via `vercel edge-config update`.
  // On laisse passer les assets statiques de /public servis à la racine pour ne
  // pas casser un éventuel rendu (la page est néanmoins self-contained).
  if (!/\.[a-z0-9]+$/i.test(request.nextUrl.pathname)) {
    if (await isMaintenanceOn()) {
      return new NextResponse(MAINTENANCE_HTML, {
        status: 503,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "retry-after": "120",
          "cache-control": "no-store",
        },
      });
    }
  }

  if (isDemoMode) return NextResponse.next();

  const path = request.nextUrl.pathname;
  const isOnApi = path.startsWith("/api");
  // Contenu public accessible à TOUS (connecté ou non) : landing + pages
  // légales. ⚠ Les pages légales DOIVENT rester publiques : elles sont liées
  // depuis le formulaire d'inscription (« J'accepte les CGU ») → un visiteur
  // non connecté doit pouvoir les consulter avant de créer son compte.
  const isPublicContent =
    path === "/" ||
    path.startsWith("/cgu") ||
    path.startsWith("/confidentialite") ||
    path.startsWith("/mentions-legales") ||
    // Fichiers statiques publics (logo des emails, icônes + manifest PWA…) :
    // ne JAMAIS les mettre derrière l'auth, sinon le logo casse dans les
    // emails et l'installation PWA échoue. Le matcher exclut déjà /_next ;
    // on couvre ici les assets de /public servis à la racine.
    /\.(png|svg|jpe?g|webp|ico|webmanifest)$/.test(path);

  // ─── Court-circuit AVANT tout appel Supabase ───
  // Routes API (auth propre) + landing/légales/assets publics : aucun besoin
  // d'auth ni de refresh de session. On sort ici → ces requêtes ne paient
  // PLUS le coût d'une validation de session (perf : ~1 opération auth en moins
  // par asset/page publique).
  if (isOnApi || isPublicContent) return NextResponse.next({ request });

  // ─── À partir d'ici : pages d'auth publiques ou pages protégées ───
  // On a besoin de connaître la présence d'une session (et de rafraîchir les
  // cookies si besoin).
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

  // getClaims() : validation LOCALE du JWT (signature + expiration, clés
  // asymétriques), SANS round-trip réseau dans le cas nominal — contrairement
  // à getUser() qui appelait Supabase à chaque requête. Le rafraîchissement des
  // cookies (token proche de l'expiration) reste déclenché au besoin. Le gate
  // métier (compte actif/approuvé) est fait par `auth()` dans les pages.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = !!data?.claims;

  const isOnPublicAuth =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password");

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
