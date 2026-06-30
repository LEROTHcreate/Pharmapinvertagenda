// Initialisation Sentry côté NAVIGATEUR. No-op sans DSN.
// La DSN Sentry est une clé d'INGESTION write-only → sans risque en public
// (préfixe NEXT_PUBLIC_).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0.1,
  // Replay désactivé par défaut (coûteux en quota) ; activable plus tard.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
