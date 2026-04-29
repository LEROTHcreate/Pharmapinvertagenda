import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// DEMO_MODE refusé en prod (sinon bypass de toute l'auth)
const isDemoMode =
  process.env.DEMO_MODE === "1" && process.env.NODE_ENV !== "production";

const realMiddleware = NextAuth(authConfig).auth;

// En mode démo, on laisse tout passer.
export default isDemoMode
  ? function demoMiddleware() {
      return NextResponse.next();
    }
  : realMiddleware;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.png|demo).*)"],
};
