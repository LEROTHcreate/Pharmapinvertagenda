import { z } from "zod";

export const createConversationInput = z.object({
  // Liste des userIds avec qui on veut créer une conversation (hors soi-même).
  // Min 1 (1-1), au-delà = groupe.
  memberIds: z.array(z.string().min(1)).min(1).max(50),
  // Nom optionnel (recommandé pour les groupes, ignoré pour 1-1).
  name: z.string().trim().min(1).max(80).nullable().optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationInput>;

/**
 * Pièce jointe image — data URL base64, max ~700KB encodé (~500KB binaire
 * après compression côté client). Mime restreint aux formats images
 * standard (PNG/JPG/WebP/GIF). Pour PDF/Excel : prévoir Supabase Storage.
 */
const attachmentSchema = z.object({
  url: z
    .string()
    .max(750_000, "Pièce jointe trop lourde (max 500 KB après compression)")
    .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, "Format invalide"),
  name: z.string().trim().min(1).max(200),
  mime: z
    .string()
    .regex(/^image\/(png|jpe?g|webp|gif)$/, "Type MIME non autorisé"),
});

export const sendMessageInput = z
  .object({
    // Texte obligatoire SAUF si une pièce jointe est fournie.
    body: z.string().trim().max(4000).optional().default(""),
    attachment: attachmentSchema.optional().nullable(),
  })
  .refine((d) => (d.body && d.body.length > 0) || d.attachment, {
    message: "Texte ou pièce jointe requis",
    path: ["body"],
  });
export type SendMessageInput = z.infer<typeof sendMessageInput>;

export const addMembersInput = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(50),
});
export type AddMembersInput = z.infer<typeof addMembersInput>;
