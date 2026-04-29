import { z } from "zod";

export const createConversationInput = z.object({
  // Liste des userIds avec qui on veut créer une conversation (hors soi-même).
  // Min 1 (1-1), au-delà = groupe.
  memberIds: z.array(z.string().min(1)).min(1).max(50),
  // Nom optionnel (recommandé pour les groupes, ignoré pour 1-1).
  name: z.string().trim().min(1).max(80).nullable().optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationInput>;

export const sendMessageInput = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

export const addMembersInput = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(50),
});
export type AddMembersInput = z.infer<typeof addMembersInput>;
