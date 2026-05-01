"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker /sw.js au premier rendu côté client.
 *
 * Volontairement silencieux : pas d'UI de prompt update, pas de notification.
 * Le SW se met à jour automatiquement quand le fichier change (cf. SW_VERSION
 * dans public/sw.js — incrémenter pour invalider tous les caches utilisateurs).
 *
 * Skipped en dev : Next génère du JS non-cachable et ça crée plus de bugs
 * que de bénéfices (HMR, Fast Refresh).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        // Échec silencieux : pas critique, l'app fonctionne sans SW
        console.warn("[sw] registration failed:", err);
      });
  }, []);

  return null;
}
