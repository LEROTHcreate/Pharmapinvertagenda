// Point d'entrée d'instrumentation Next.js : charge la config Sentry adaptée
// au runtime au démarrage du serveur. (Le client est chargé via
// sentry.client.config.ts injecté par withSentryConfig.)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
