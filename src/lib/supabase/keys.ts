/**
 * Résolution des clés Supabase, tolérante aux deux conventions de nommage :
 *  - ancienne : NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *  - nouvelle : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY
 *    (format `sb_publishable_…` / `sb_secret_…`).
 *
 * Les variables NEXT_PUBLIC_* sont inlinées par Next au build (OK côté edge).
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Clé publique (anon / publishable) — exposable au navigateur. */
export const SUPABASE_PUBLISHABLE_KEY = (process.env
  .NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;

/** Clé secrète (service_role / secret) — SERVEUR uniquement. */
export function getSupabaseSecretKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  );
}
