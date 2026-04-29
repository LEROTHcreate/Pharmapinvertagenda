import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";

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

export type AuthedSession = Session & {
  user: NonNullable<Session["user"]>;
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
  return async (
    req: Request,
    ctx: { params: P }
  ): Promise<NextResponse | Response> => {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    return handler(req, {
      session: session as AuthedSession,
      params: ctx.params,
    });
  };
}

/**
 * Wrap un handler en exigeant une session ADMIN.
 */
export function withAdminAuth<P = unknown>(handler: Handler<P>) {
  return async (
    req: Request,
    ctx: { params: P }
  ): Promise<NextResponse | Response> => {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return handler(req, {
      session: session as AuthedSession,
      params: ctx.params,
    });
  };
}

/** Helper de lecture pour les checks ad-hoc dans le code applicatif. */
export function isAdmin(session: { user?: { role?: string } } | null | undefined) {
  return session?.user?.role === "ADMIN";
}
