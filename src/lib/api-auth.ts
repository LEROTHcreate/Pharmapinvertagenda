import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { AppSession } from "@/types/session";
import { withErrorHandling } from "@/lib/api-handler";
import { isAdminLevel, type RoleInput } from "@/lib/permissions";

/**
 * Helpers pour les routes API : factorisent le pattern répété
 *  1) `await auth()`
 *  2) check session
 *  3) check rôle admin (si applicable)
 *  4) handler reçoit la session typée non-null
 *
 * Usage :
 *   export const POST = withAdminAuth(async (req, { session, params }) => {
 *     // session.user.role === "ADMIN" garanti
 *     // session.user.pharmacyId disponible
 *     ...
 *   });
 */

export type AuthedSession = AppSession & {
  user: NonNullable<AppSession["user"]>;
};

type RouteContext<P = unknown> = {
  session: AuthedSession;
  params: P;
};

type Handler<P = unknown> = (
  req: Request,
  ctx: RouteContext<P>
) => Promise<NextResponse | Response> | NextResponse | Response;

/**
 * Wrap un handler en exigeant une session authentifiée.
 */
export function withAuth<P = unknown>(handler: Handler<P>) {
  // withErrorHandling : capture les erreurs de connectivité BDD (cold-start
  // Supabase) levées par auth() ou le handler → 503 au lieu d'un 500 opaque.
  return withErrorHandling(
    async (req: Request, ctx: { params: P }): Promise<NextResponse | Response> => {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
      return handler(req, {
        session: session as AuthedSession,
        params: ctx.params,
      });
    }
  );
}

/**
 * Wrap un handler en exigeant une session de niveau ADMIN (titulaire OU
 * créateur). Le MANAGEUR est refusé — utiliser `withRoleAuth(capacité)` pour
 * les routes qu'un manageur doit pouvoir appeler (planning, gabarits, équipe).
 */
export function withAdminAuth<P = unknown>(handler: Handler<P>) {
  return withRoleAuth(isAdminLevel, handler);
}

/**
 * Wrap un handler en exigeant que le rôle de session satisfasse `check`
 * (une capacité de `src/lib/permissions.ts`, ex. `canEditPlanning`).
 *
 *   export const POST = withRoleAuth(canEditPlanning, async (req, { session }) => { … });
 */
export function withRoleAuth<P = unknown>(
  check: (role: RoleInput) => boolean,
  handler: Handler<P>
) {
  return withErrorHandling(
    async (req: Request, ctx: { params: P }): Promise<NextResponse | Response> => {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
      if (!check(session.user.role)) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      return handler(req, {
        session: session as AuthedSession,
        params: ctx.params,
      });
    }
  );
}

/**
 * Helper de lecture pour les checks ad-hoc : niveau ADMIN (titulaire OU
 * créateur). Normalise le rôle brut (dont l'alias legacy EMPLOYEE).
 */
export function isAdmin(session: { user?: { role?: string } } | null | undefined) {
  return isAdminLevel(session?.user?.role);
}
