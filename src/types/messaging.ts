// Types partagés client/serveur pour la messagerie

export type ConversationMemberDTO = {
  userId: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
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

export type MessageDTO = {
  id: string;
  body: string;
  type: "TEXT" | "SWAP_REQUEST" | "SYSTEM";
  createdAt: string;
  author: { id: string; name: string };
  swapRequest: SwapRequestDTO | null;
};

export type ContactDTO = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
};
