"use client";

import { Loader2, Users, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationDTO, ConversationMemberDTO } from "@/types/messaging";
import { AvatarImage } from "@/components/layout/AvatarImage";

type Props = {
  conversations: ConversationDTO[];
  currentUserId: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
};

/** Calcule le titre affiché pour une conversation (groupe → nom, 1-1 → autre membre) */
function conversationTitle(conv: ConversationDTO, currentUserId: string): string {
  if (conv.isGroup) {
    if (conv.name) return conv.name;
    // Fallback : noms des membres séparés par des virgules
    return conv.members
      .filter((m) => m.userId !== currentUserId)
      .map((m) => m.name)
      .join(", ");
  }
  // 1-1 : nom de l'autre
  const other = conv.members.find((m) => m.userId !== currentUserId);
  return other?.name ?? "Conversation";
}

/** Pour les 1-1, retourne le membre "autre" (pour l'avatar). Null si groupe. */
function conversationPeer(
  conv: ConversationDTO,
  currentUserId: string
): ConversationMemberDTO | null {
  if (conv.isGroup) return null;
  return conv.members.find((m) => m.userId !== currentUserId) ?? null;
}

function lastMessagePreview(conv: ConversationDTO, currentUserId: string): string {
  if (!conv.lastMessage) return "Pas encore de message";
  const isMe = conv.lastMessage.authorId === currentUserId;
  const prefix = isMe ? "Vous : " : "";
  if (conv.lastMessage.type === "SWAP_REQUEST") {
    return `${prefix}↔ Demande d'échange`;
  }
  if (conv.lastMessage.type === "SYSTEM") {
    return conv.lastMessage.body;
  }
  return prefix + conv.lastMessage.body;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffJ = Math.floor(diffH / 24);
  if (diffJ < 7) return `${diffJ} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export function ConversationList({
  conversations,
  currentUserId,
  activeId,
  onSelect,
  loading,
}: Props) {
  if (loading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-zinc-500">
        Aucune conversation. Clique sur « Nouvelle » pour démarrer.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100">
      {conversations.map((conv) => {
        const active = conv.id === activeId;
        const title = conversationTitle(conv, currentUserId);
        const peer = conversationPeer(conv, currentUserId);
        const preview = lastMessagePreview(conv, currentUserId);
        const time = conv.lastMessage
          ? formatRelative(conv.lastMessage.createdAt)
          : formatRelative(conv.updatedAt);
        return (
          <li key={conv.id}>
            <button
              onClick={() => onSelect(conv.id)}
              className={cn(
                "w-full text-left px-4 py-3 transition-colors hover:bg-zinc-50",
                active && "bg-violet-50/50 hover:bg-violet-50"
              )}
            >
              <div className="flex items-center gap-3">
                {/* Avatar de l'autre membre (1-1) ou pictogramme groupe */}
                {peer ? (
                  <AvatarImage
                    avatarId={peer.avatarId}
                    firstName={peer.firstName ?? peer.name.split(/\s+/).pop() ?? "?"}
                    color={peer.displayColor}
                    size={36}
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                    <Users className="h-4 w-4" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {conv.isGroup && (
                      <Users className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    )}
                    {conv.shadowAccess && (
                      <Eye
                        className="h-3.5 w-3.5 text-amber-500 shrink-0"
                        aria-label="Accès modération"
                      />
                    )}
                    <span className="font-semibold text-[14px] text-zinc-900 truncate">
                      {title}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-[12.5px] truncate mt-0.5",
                      conv.unread
                        ? "text-zinc-900 font-medium"
                        : "text-zinc-500"
                    )}
                  >
                    {preview}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10.5px] text-zinc-400 tabular-nums">
                    {time}
                  </span>
                  {conv.unread && (
                    <span className="h-2 w-2 rounded-full bg-violet-600" />
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
