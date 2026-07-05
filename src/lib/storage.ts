import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Upload d'images vers Supabase Storage.
 *
 * Deux buckets :
 *  - `attachments` (PUBLIC) : logo de l'officine. Non sensible, et affiché
 *    même hors connexion (page /login) → une URL publique convient.
 *  - `secure` (PRIVÉ) : pièces jointes sensibles (messagerie, notes de paie).
 *    Données RH / potentiellement de santé → jamais accessibles par URL
 *    devinable. On stocke le CHEMIN en base et on génère une URL signée
 *    temporaire à la lecture (`signedAttachmentUrl`), uniquement dans des
 *    endpoints déjà authentifiés/autorisés.
 *
 * Pourquoi Storage plutôt que base64 en base : les images étaient stockées en
 * base64 dans des colonnes `@db.Text` → gonflement de la BDD et de chaque
 * requête. Ici on ne stocke qu'une URL (logo) ou un chemin (privé).
 *
 * Côté serveur uniquement (clé service role).
 */

const PUBLIC_BUCKET = "attachments"; // logos officine (public)
const SECURE_BUCKET = "secure"; // pièces jointes sensibles (privé)
/** Durée de validité d'une URL signée (1 h) — assez pour consulter, pas plus. */
const SIGNED_URL_TTL = 60 * 60;

/** Parse une data URL base64 → buffer + mime + extension. Null sinon. */
function parseDataUrl(
  input: string
): { buffer: Buffer; mime: string; ext: string } | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(input);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext =
    mime === "image/png"
      ? "png"
      : mime === "image/webp"
        ? "webp"
        : mime === "image/svg+xml"
          ? "svg"
          : "jpg";
  return { buffer: Buffer.from(m[2], "base64"), mime, ext };
}

// Le bucket privé est créé à la volée (idempotent) → pas d'étape manuelle dans
// le dashboard Supabase. On mémorise sa disponibilité pour éviter un appel
// réseau superflu à chaque upload d'une même instance serveur.
let secureBucketReady = false;
async function ensureSecureBucket(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<void> {
  if (secureBucketReady) return;
  const { error } = await admin.storage.createBucket(SECURE_BUCKET, {
    public: false,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  });
  // Déjà créé → parfait, on continue. Toute autre erreur remonte.
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`[storage] création du bucket privé échouée : ${error.message}`);
  }
  secureBucketReady = true;
}

/**
 * Si `value` est une data URL base64 image, l'uploade dans Storage.
 *  - `secure: false` (défaut) → bucket public, renvoie l'URL publique (logos).
 *  - `secure: true` → bucket privé, renvoie le CHEMIN (à signer à la lecture).
 *
 * Idempotent : si `value` n'est pas une data URL (déjà une URL http ou un
 * chemin, ou null/empty), renvoie `value` inchangé.
 */
export async function uploadImageIfDataUrl(
  value: string | null | undefined,
  folder: string,
  opts?: { secure?: boolean }
): Promise<string | null> {
  if (!value) return null;
  const parsed = parseDataUrl(value);
  if (!parsed) return value; // déjà une URL / un chemin — inchangé

  const admin = createSupabaseAdminClient();
  const path = `${folder}/${randomUUID()}.${parsed.ext}`;

  if (opts?.secure) {
    await ensureSecureBucket(admin);
    const { error } = await admin.storage
      .from(SECURE_BUCKET)
      .upload(path, parsed.buffer, { contentType: parsed.mime, upsert: false });
    if (error) {
      throw new Error(`[storage] upload privé échoué : ${error.message}`);
    }
    // On stocke le CHEMIN (pas d'URL) → l'URL signée est générée à la lecture.
    return path;
  }

  const { error } = await admin.storage
    .from(PUBLIC_BUCKET)
    .upload(path, parsed.buffer, { contentType: parsed.mime, upsert: false });
  if (error) {
    throw new Error(`[storage] upload échoué : ${error.message}`);
  }
  return admin.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Transforme la valeur stockée d'une pièce jointe sensible en URL affichable :
 *  - chemin (nouveau format, bucket privé) → URL signée temporaire (1 h) ;
 *  - URL http (ancien format public / legacy) → renvoyée telle quelle ;
 *  - null / vide → null.
 *
 * À appeler UNIQUEMENT dans un endpoint déjà authentifié ET autorisé à voir la
 * ressource : l'URL signée donne un accès direct au fichier le temps de sa
 * validité.
 */
export async function signedAttachmentUrl(
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null;
  // Ancien format (fichier dans le bucket public) → l'URL fonctionne déjà.
  if (/^https?:\/\//i.test(value)) return value;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(SECURE_BUCKET)
    .createSignedUrl(value, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}
