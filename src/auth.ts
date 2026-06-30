import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSession } from "@/types/session";
// Side-effect : valide les env vars au démarrage (fail-fast).
import "@/env";

const isDemoMode =
  process.env.DEMO_MODE === "1" && process.env.NODE_ENV !== "production";

// Garde-fou : DEMO_MODE interdit en prod (bypass complet d'authentification).
if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "1") {
  throw new Error(
    "[auth] DEMO_MODE=1 est interdit en production (bypass d'authentification)."
  );
}

// Session factice utilisée en mode démo (aucune connexion réelle).
const demoSession: AppSession = {
  user: {
    id: "user-admin",
    email: "admin@pharmacie-demo.fr",
    name: "Agnès Bertrand (démo)",
    role: "ADMIN",
    pharmacyId: "demo-pharmacy",
    employeeId: "emp-1",
  },
  expires: new Date(Date.now() + 86400000 * 30).toISOString(),
};

/**
 * Récupère la session applicative.
 *
 * Drop-in de l'ancien `auth()` NextAuth : renvoie exactement la même forme
 * `{ user: { id, email, name, role, pharmacyId, employeeId }, expires }` ou
 * `null`. Tous les appelants (`await auth()`) restent inchangés.
 *
 * Identité : Supabase Auth (cookies de session). Données métier : table
 * `users` (Prisma), liée par email. On applique le même gate qu'avant :
 * compte actif ET approuvé, sinon `null` (un compte PENDING/désactivé qui
 * aurait une session Supabase est traité comme non connecté).
 *
 * Mémoïsé par requête via `cache()` de React : sur une même navigation,
 * `auth()` est appelé plusieurs fois (generateMetadata + layout + page).
 * Sans cache, chaque appel refait un round-trip réseau `getUser()` vers
 * Supabase Auth + une requête DB → latence inutile. `cache()` garantit
 * un seul appel réel par requête serveur, partagé entre tous les appelants.
 */
export const auth = cache(async (): Promise<AppSession | null> => {
  if (isDemoMode) return demoSession;

  const supabase = createSupabaseServerClient();
  // getUser() valide le JWT auprès de Supabase (≠ getSession qui ne fait que
  // lire le cookie sans vérifier la signature).
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: authUser.email },
  });
  if (!user || !user.isActive || user.status !== "APPROVED") return null;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      pharmacyId: user.pharmacyId,
      employeeId: user.employeeId,
    },
    // Supabase gère l'expiration réelle des tokens ; on expose une valeur
    // indicative pour conserver la forme attendue par les consommateurs.
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
});
