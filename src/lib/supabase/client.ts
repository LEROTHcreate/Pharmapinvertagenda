import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./keys";

/**
 * Client Supabase côté navigateur (singleton). Utilise la clé publique
 * (anon / publishable). Sert surtout à observer l'état d'auth côté client si
 * besoin ; la connexion elle-même passe par une server action (`loginAction`)
 * pour conserver le rate-limit et le gate de statut côté serveur.
 */
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return browserClient;
}
