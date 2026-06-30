import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Upload d'images vers Supabase Storage (bucket public `attachments`).
 *
 * Pourquoi : les images (logo officine, pièces jointes messagerie / notes de
 * paie) étaient stockées en base64 dans des colonnes `@db.Text` → gonflement
 * de la BDD et de chaque requête qui les ramène. Ici on stocke juste l'URL.
 *
 * Côté serveur uniquement (clé service role). Idempotent : si la valeur est
 * déjà une URL http (ou null), on la renvoie inchangée → on peut l'appeler
 * sans risque même quand le client n'a pas joint de nouvelle image.
 */

const BUCKET = "attachments";

/** Parse une data URL base64 → buffer + mime + extension. Null sinon. */
function parseDataUrl(
  input: string
): { buffer: Buffer; mime: string; ext: string } | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(input);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return { buffer: Buffer.from(m[2], "base64"), mime, ext };
}

/**
 * Si `value` est une data URL base64 image, l'uploade dans Storage et renvoie
 * l'URL publique. Sinon (URL http déjà, ou null/empty) renvoie `value` tel
 * quel. `folder` segmente le bucket (ex. "logos", "messages", "payroll").
 */
export async function uploadImageIfDataUrl(
  value: string | null | undefined,
  folder: string
): Promise<string | null> {
  if (!value) return null;
  const parsed = parseDataUrl(value);
  if (!parsed) return value; // déjà une URL — inchangé

  const admin = createSupabaseAdminClient();
  const path = `${folder}/${randomUUID()}.${parsed.ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, parsed.buffer, {
    contentType: parsed.mime,
    upsert: false,
  });
  if (error) {
    throw new Error(`[storage] upload échoué : ${error.message}`);
  }
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
