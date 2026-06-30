"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Erreur globale du root layout — filet de dernier recours quand l'erreur
 * survient AU-DESSUS du layout (cas rare ; error.tsx couvre le reste). Remonte
 * à Sentry et rend un fallback minimal (il remplace tout le document, d'où le
 * <html>/<body>).
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#3f3f46",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Une erreur inattendue est survenue
          </h1>
          <p style={{ color: "#71717a", marginTop: "0.5rem" }}>
            Rechargez la page. Si le problème persiste, contactez le support.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "1.25rem",
              padding: "0.6rem 1.25rem",
              borderRadius: "9999px",
              background: "#7c3aed",
              color: "white",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Retour à l&apos;accueil
          </a>
        </div>
      </body>
    </html>
  );
}
