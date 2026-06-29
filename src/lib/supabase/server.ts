import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  getSupabaseSecretKey,
} from "./keys";

/**
 * Clients Supabase côté serveur.
 *
 * - `createSupabaseServerClient()` : client lié aux cookies de la requête.
 *   Utilisé pour lire la session de l'utilisateur connecté (RSC, route
 *   handlers, server actions) et pour poser/rafraîchir les cookies de session.
 *
 * - `createSupabaseAdminClient()` : client "service role" (clé secrète, JAMAIS
 *   exposée au navigateur). Bypass la Row Level Security. Réservé aux
 *   opérations d'administration : créer un compte (signup), changer un mot de
 *   passe (reset). Ne JAMAIS l'utiliser dans du code envoyé au client.
 */

/**
 * Client serveur lié aux cookies. En Next 14, `cookies()` est synchrone.
 * Le `setAll` peut être appelé depuis un Server Component (lecture seule) :
 * dans ce cas l'écriture lève, on l'ignore — le middleware se charge de
 * rafraîchir les cookies de session à chaque requête.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Appelé depuis un Server Component → écriture cookie interdite.
          // Sans gravité : le middleware rafraîchit la session.
        }
      },
    },
  });
}

/**
 * Client admin (service role). Pas de persistance de session : c'est un client
 * "machine", pas lié à un utilisateur. À n'utiliser QUE côté serveur.
 */
export function createSupabaseAdminClient() {
  const secretKey = getSupabaseSecretKey();
  if (!secretKey) {
    throw new Error(
      "[supabase] Clé secrète manquante (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY) — requise pour les opérations admin (signup/reset)."
    );
  }
  return createClient(SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Met à jour le mot de passe d'un compte Supabase (via service role).
 * Utilisé par les flux reset / change password. `authUserId` peut être null
 * pour les comptes pas encore migrés vers auth.users → on log et on n'échoue
 * pas le flux (le miroir bcrypt domaine reste, lui, à jour).
 */
export async function setSupabasePassword(
  authUserId: string | null,
  password: string
): Promise<void> {
  if (!authUserId) {
    console.warn(
      "[supabase] setSupabasePassword: authUserId null (compte non migré) — màj Supabase ignorée."
    );
    return;
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    password,
  });
  if (error) {
    throw new Error(`[supabase] updateUserById échoué : ${error.message}`);
  }
}
