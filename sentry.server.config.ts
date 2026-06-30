// Initialisation Sentry côté SERVEUR (route handlers, server actions, RSC).
// No-op tant que NEXT_PUBLIC_SENTRY_DSN n'est pas défini → activable plus tard
// sans toucher au code (il suffit d'ajouter la variable d'env côté Vercel).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  // Échantillonnage des traces de perf (10%) — suffisant pour repérer les
  // tendances sans exploser le quota Sentry.
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
