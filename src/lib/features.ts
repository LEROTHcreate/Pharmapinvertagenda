/**
 * Feature flags applicatifs.
 *
 * Permettent de désactiver une feature partout (UI + API) sans supprimer le
 * code. Idéal pour les modules en cours de finition / refonte.
 *
 * Pour réactiver : passer la valeur à `true` ici → l'UI réaffiche les boutons
 * et l'API arrête de renvoyer 503. Tout le code/BDD reste intact entretemps.
 */

export const FEATURES = {
  /**
   * Demandes d'échange de jours de travail entre collègues (via la
   * messagerie). Bouton "Demande d'échange" caché, dialog de proposition
   * inaccessible, API `/api/swaps/**` répond 503. Les SwapRequest existants
   * restent en BDD pour quand on rallume.
   *
   * En "travaux" → afficher un bandeau discret pour informer l'équipe.
   */
  shiftSwap: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function isFeatureEnabled(key: FeatureKey): boolean {
  return Boolean(FEATURES[key]);
}

/**
 * Helper côté API : si la feature est désactivée, renvoie une `Response` 503
 * prête à retourner. Sinon renvoie `null` et la route continue normalement.
 *
 * Usage :
 *   const gate = featureGate("shiftSwap");
 *   if (gate) return gate;
 *   // ... reste de la route
 */
export function featureGate(key: FeatureKey): Response | null {
  if (FEATURES[key]) return null;
  return new Response(
    JSON.stringify({
      error: "FEATURE_DISABLED",
      message: "Cette fonctionnalité est en cours de développement.",
    }),
    {
      status: 503,
      headers: { "content-type": "application/json" },
    }
  );
}
