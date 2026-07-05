// Types partagés client/serveur pour la messagerie
import type { UserRole } from "@prisma/client";

export type ConversationMemberDTO = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  /** Avatar choisi (cf. src/lib/avatars.ts) — null = fallback initiale. */
  avatarId: string | null;
  /** Prénom isolé (depuis Employee.firstName) si lié, sinon null. */
  firstName: string | null;
  /** Couleur planning du collaborateur lié, pour le fallback. */
  displayColor: string | null;
};

export type LastMessageDTO = {
  id: string;
  body: string;
  type: "TEXT" | "SWAP_REQUEST" | "SYSTEM";
  createdAt: string; // ISO
  authorId: string;
};

export type ConversationDTO = {
  id: string;
  name: string | null;
  isGroup: boolean;
  updatedAt: string;
  members: ConversationMemberDTO[];
  lastMessage: LastMessageDTO | null;
  unread: boolean;
  shadowAccess: boolean;
};

export type SwapStatusDTO =
  | "PENDING_TARGET"
  | "REJECTED_TARGET"
  | "PENDING_ADMIN"
  | "APPROVED"
  | "REJECTED_ADMIN"
  | "CANCELLED";

export type SwapRequestDTO = {
  id: string;
  status: SwapStatusDTO;
  requesterId: string;
  targetId: string;
  date: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
  fullDay: boolean;
  reason: string | null;
  rejectionNote: string | null;
};

export type MessageAttachmentDTO = {
  /** Data URL `data:image/...;base64,...` (image, max 500KB après compression). */
  url: string;
  /** Nom de fichier original (display only). */
  name: string;
  /** Mime du fichier — image/png, image/jpeg, image/webp, image/gif. */
  mime: string;
};

export type MessageDTO = {
  id: string;
  body: string;
  type: "TEXT" | "SWAP_REQUEST" | "SYSTEM";
  createdAt: string;
  /** Pièce jointe optionnelle (image). Null si pas de PJ. */
  attachment: MessageAttachmentDTO | null;
  author: {
    id: string;
    name: string;
    /** Avatar choisi par l'auteur du message (peut être null). */
    avatarId: string | null;
    /** Prénom isolé pour le fallback initiale + bandeau "ma propre couleur". */
    firstName: string | null;
    displayColor: string | null;
  };
  swapRequest: SwapRequestDTO | null;
};

export type ContactDTO = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Compte "Support PharmaPlanning" — visible cross-pharmacy. Affiche un
   *  badge dédié dans la liste de contacts (ex. "Programmeur · Support"). */
  isGlobalSupport?: boolean;
};
