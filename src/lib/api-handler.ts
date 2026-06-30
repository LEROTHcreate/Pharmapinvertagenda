import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * Détecte les erreurs de connectivité Postgres/Prisma : base en pause (Supabase
 * free tier après ~7j d'inactivité), timeout, connexion coupée, échec
 * d'initialisation du client. Codes Prisma P1xxx ou PrismaClientInitializationError.
 *
 * Permet de renvoyer un 503 « réessayez » au lieu d'un 500 indistinct d'un
 * vrai bug applicatif.
 */
export function isDbConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string };
  if (e.name === "PrismaClientInitializationError") return true;
  return typeof e.code === "string" && /^P1\d{3}$/.test(e.code);
}

function safePath(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "?";
  }
}

/**
 * Erreurs de "control-flow" internes à Next (à NE PAS capturer) : `redirect()`,
 * `notFound()`, et la détection de route dynamique (`cookies()`/`headers()` au
 * build). Next les identifie par un `digest`. Si on les avalait, on casserait
 * la détection dynamique et les redirections.
 */
function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("digest" in err)) return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE")
  );
}

/**
 * Enrobe un handler de route API d'un filet d'erreur global.
 *
 *  - Erreur de connectivité BDD → 503 SERVICE_UNAVAILABLE (le client invite à
 *    réessayer dans un instant) plutôt qu'un 500 opaque.
 *  - Toute autre exception → 500 SERVER_ERROR, loggée avec la méthode + le
 *    chemin pour diagnostic (logs Vercel).
 *
 * La signature générique `(...args)` PRÉSERVE l'arité du handler : elle marche
 * aussi bien pour une route statique `(req)` que dynamique `(req, { params })`,
 * sans casser le typage attendu par Next.
 *
 * Usage :
 *   export const GET = withErrorHandling(async (req) => { ... });
 *   export const PATCH = withErrorHandling(async (req, { params }) => { ... });
 */
export function withErrorHandling<A extends unknown[]>(
  handler: (...args: A) => Response | Promise<Response>
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      // Laisse passer les signaux internes de Next (redirect/notFound/dynamic).
      if (isNextControlFlowError(err)) throw err;
      const req = args[0] as Request | undefined;
      const where =
        req && typeof req === "object" && "url" in req
          ? `${req.method} ${safePath(req)}`
          : "api";
      console.error(`[api] ${where} — exception non gérée:`, err);
      // Remonte l'exception à Sentry (no-op si DSN non configurée). On n'envoie
      // PAS les erreurs de connectivité BDD (cold-start attendu, bruit inutile).
      if (!isDbConnectivityError(err)) {
        Sentry.captureException(err, { tags: { route: where } });
      }
      if (isDbConnectivityError(err)) {
        return NextResponse.json(
          { error: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
    }
  };
}
