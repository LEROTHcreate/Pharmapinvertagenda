/**
 * Migration ponctuelle : pièces jointes base64 (BDD) → Supabase Storage.
 *
 * Parcourt les tables `messages` et `payroll_notes`, et pour chaque
 * `attachmentUrl` au format data URL base64 : uploade l'image dans le bucket
 * public `attachments` puis remplace la colonne par l'URL publique.
 *
 * Idempotent (les lignes déjà en http sont ignorées). À lancer une fois :
 *   node scripts/migrate-attachments-storage.js
 *
 * Prérequis : .env avec NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (ou
 * SUPABASE_SERVICE_ROLE_KEY), et le bucket `attachments` créé (public).
 */
const { PrismaClient } = require("@prisma/client");
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
require("dotenv").config();

const prisma = new PrismaClient();
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function uploadDataUrl(dataUrl, folder) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from("attachments")
    .upload(path, Buffer.from(m[2], "base64"), { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return admin.storage.from("attachments").getPublicUrl(path).data.publicUrl;
}

async function migrate(model, folder) {
  const rows = await prisma[model].findMany({
    where: { attachmentUrl: { startsWith: "data:" } },
    select: { id: true, attachmentUrl: true },
  });
  let n = 0;
  for (const r of rows) {
    const url = await uploadDataUrl(r.attachmentUrl, folder);
    if (url) {
      await prisma[model].update({ where: { id: r.id }, data: { attachmentUrl: url } });
      n++;
    }
  }
  return n;
}

(async () => {
  try {
    const m = await migrate("message", "messages");
    const p = await migrate("payrollNote", "payroll");
    console.log(`Migré → messages: ${m}, payroll_notes: ${p}`);
  } catch (e) {
    console.error("Migration échouée:", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
