"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Send,
  ArrowLeftRight,
  Users,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ConversationDTO, MessageDTO } from "@/types/messaging";
import { SwapCard } from "@/components/messages/SwapCard";
import { SwapProposalDialog } from "@/components/messages/SwapProposalDialog";

type Props = {
  conversation: ConversationDTO;
  messages: MessageDTO[];
  loading: boolean;
  currentUser: { id: string; name: string; role: "ADMIN" | "EMPLOYEE" };
  shadowAccess: boolean;
  onBack: () => void;
  onMessageSent: () => void;
  onSwapUpdated: () => void;
};

function conversationTitle(conv: ConversationDTO, currentUserId: string) {
  if (conv.isGroup) {
    if (conv.name) return conv.name;
    return conv.members
      .filter((m) => m.userId !== currentUserId)
      .map((m) => m.name)
      .join(", ");
  }
  return (
    conv.members.find((m) => m.userId !== currentUserId)?.name ?? "Conversation"
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "Aujourd'hui";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function ConversationPanel({
  conversation,
  messages,
  loading,
  currentUser,
  shadowAccess,
  onBack,
  onMessageSent,
  onSwapUpdated,
}: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll en bas à chaque nouveau message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, conversation.id]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur d'envoi");
        return;
      }
      setDraft("");
      onMessageSent();
    } finally {
      setSending(false);
    }
  }

  const title = conversationTitle(conversation, currentUser.id);
  // Pour 1-1 : la cible des swaps proposés = l'autre membre
  const otherMember = conversation.members.find(
    (m) => m.userId !== currentUser.id
  );

  // Regroupe les messages par jour
  const grouped: Array<{ date: string; messages: MessageDTO[] }> = [];
  messages.forEach((m) => {
    const dayKey = m.createdAt.slice(0, 10);
    const last = grouped[grouped.length - 1];
    if (last && last.date === dayKey) {
      last.messages.push(m);
    } else {
      grouped.push({ date: dayKey, messages: [m] });
    }
  });

  return (
    <div className="flex flex-1 flex-col min-w-0 bg-white">
      {/* En-tête */}
      <div className="flex items-center gap-2 border-b border-zinc-200/70 px-4 py-3">
        <button
          onClick={onBack}
          className="md:hidden rounded-md p-1 hover:bg-zinc-100"
          aria-label="Retour"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {conversation.isGroup && (
            <Users className="h-4 w-4 text-zinc-400 shrink-0" />
          )}
          <span className="font-semibold truncate">{title}</span>
          {shadowAccess && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 shrink-0"
              title="Accès modération — vous n'êtes pas membre de cette conversation"
            >
              <Eye className="h-3 w-3" />
              Modération
            </span>
          )}
        </div>
        {conversation.isGroup && (
          <span className="ml-auto text-[11px] text-zinc-400">
            {conversation.members.length} membres
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-zinc-400 py-12">
            Aucun message. Soyez le premier à écrire.
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <div key={group.date} className="space-y-2">
                <div className="text-center text-[11px] uppercase tracking-wide text-zinc-400 font-medium">
                  {formatDateLabel(group.date)}
                </div>
                {group.messages.map((m) => {
                  const isMe = m.author.id === currentUser.id;
                  if (m.type === "SWAP_REQUEST" && m.swapRequest) {
                    return (
                      <SwapCard
                        key={m.id}
                        message={m}
                        currentUser={currentUser}
                        otherMembers={conversation.members}
                        onUpdated={onSwapUpdated}
                      />
                    );
                  }
                  if (m.type === "SYSTEM") {
                    return (
                      <div
                        key={m.id}
                        className="text-center text-[11px] text-zinc-400 italic"
                      >
                        {m.body}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={m.id}
                      className={cn("flex gap-2", isMe && "justify-end")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 text-[14px]",
                          isMe
                            ? "bg-violet-600 text-white rounded-br-sm"
                            : "bg-zinc-100 text-zinc-900 rounded-bl-sm"
                        )}
                      >
                        {!isMe && conversation.isGroup && (
                          <p className="text-[11px] font-semibold text-violet-700 mb-0.5">
                            {m.author.name}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">
                          {m.body}
                        </p>
                        <p
                          className={cn(
                            "text-[10px] mt-1 opacity-70",
                            isMe ? "text-violet-100" : "text-zinc-400"
                          )}
                        >
                          {formatTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer ou bandeau lecture seule */}
      {shadowAccess ? (
        <div className="border-t border-zinc-200/70 bg-amber-50 px-4 py-3 text-center text-[12.5px] text-amber-800">
          <Eye className="inline h-3.5 w-3.5 mr-1" />
          Accès lecture seule (modération) — vous n'êtes pas membre de cette
          conversation.
        </div>
      ) : (
        <div className="border-t border-zinc-200/70 bg-white px-3 py-2">
          {error && (
            <div className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-[12px] text-red-700">
              {error}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => setSwapOpen(true)}
              disabled={!otherMember && !conversation.isGroup}
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 text-[12px] font-medium text-zinc-700 transition disabled:opacity-50"
              title="Demander un échange de créneau"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Échange
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Écrire un message…"
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 max-h-32"
              disabled={sending}
            />
            <Button size="sm" onClick={handleSend} disabled={!draft.trim() || sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      <SwapProposalDialog
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        conversation={conversation}
        currentUserId={currentUser.id}
        onCreated={() => {
          setSwapOpen(false);
          onMessageSent();
        }}
      />
    </div>
  );
}
