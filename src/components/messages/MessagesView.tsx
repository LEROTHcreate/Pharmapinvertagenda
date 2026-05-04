"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ConversationDTO,
  ContactDTO,
  MessageDTO,
} from "@/types/messaging";
import { ConversationList } from "@/components/messages/ConversationList";
import { ConversationPanel } from "@/components/messages/ConversationPanel";
import { NewConversationDialog } from "@/components/messages/NewConversationDialog";

const POLL_LIST_MS = 15_000;
const POLL_MESSAGES_MS = 5_000;

/** True quand la page est cachée (onglet en arrière-plan, écran verrouillé…). */
function isPageHidden() {
  return typeof document !== "undefined" && document.hidden;
}

type Props = {
  currentUser: { id: string; name: string; role: "ADMIN" | "EMPLOYEE" };
  contacts: ContactDTO[];
};

export function MessagesView({ currentUser, contacts }: Props) {
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [shadowMode, setShadowMode] = useState(false);
  const [activeShadow, setActiveShadow] = useState(false);

  const isAdmin = currentUser.role === "ADMIN";

  // Mémorise le `createdAt` du dernier message connu par conv pour les polls
  // incrémentaux (?since=…). Évite de re-télécharger toute la conv toutes les 5s.
  const lastFetchedAtRef = useRef<Map<string, string>>(new Map());

  /* ─── Polling liste des conversations ──────────────────────────── */
  const fetchList = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingList(true);
      try {
        const url = shadowMode
          ? "/api/conversations?all=1"
          : "/api/conversations";
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { conversations: ConversationDTO[] };
        setConversations(data.conversations);
      } finally {
        if (!silent) setLoadingList(false);
      }
    },
    [shadowMode]
  );

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const id = setInterval(() => {
      // Skip si l'onglet est en arrière-plan : pas de raison de polling
      // quand l'utilisateur ne regarde pas (économie batterie + bande passante).
      if (isPageHidden()) return;
      fetchList(true);
    }, POLL_LIST_MS);
    return () => clearInterval(id);
  }, [fetchList]);

  /* ─── Fetch des messages d'une conv ─────────────────────────────
   * `incremental=true` → utilise ?since=<lastFetchedAt> et append les nouveaux.
   * Utilisé pour le polling. Pour les déclenchements manuels (envoi, action sur
   * un swap), on fait un full fetch pour rafraîchir les statuts existants
   * (ex: une SwapCard PENDING_TARGET qui passe en PENDING_ADMIN).
   */
  const fetchMessages = useCallback(
    async (
      convId: string,
      opts: { silent?: boolean; incremental?: boolean } = {}
    ) => {
      const { silent = false, incremental = false } = opts;
      if (!silent) setLoadingMessages(true);
      try {
        const since = incremental
          ? lastFetchedAtRef.current.get(convId)
          : undefined;
        const url = since
          ? `/api/conversations/${convId}/messages?since=${encodeURIComponent(since)}`
          : `/api/conversations/${convId}/messages`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: MessageDTO[];
          shadowAccess: boolean;
        };

        if (incremental) {
          // Append uniquement les messages réellement nouveaux (dédup par id)
          if (data.messages.length > 0) {
            setMessages((prev) => {
              const existing = new Set(prev.map((m) => m.id));
              const additions = data.messages.filter((m) => !existing.has(m.id));
              if (additions.length === 0) return prev;
              return [...prev, ...additions];
            });
          }
        } else {
          setMessages(data.messages);
          setActiveShadow(data.shadowAccess);
        }

        // Met à jour le marqueur pour le prochain poll incrémental.
        // Si pas de message du tout, on met `now` pour ne pas re-tirer
        // tout l'historique au prochain poll.
        if (data.messages.length > 0) {
          lastFetchedAtRef.current.set(
            convId,
            data.messages[data.messages.length - 1].createdAt
          );
        } else if (!incremental) {
          lastFetchedAtRef.current.set(convId, new Date().toISOString());
        }
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    // Reset du marker pour repartir d'un full fetch propre quand on (re)ouvre
    // la conv — sinon un changement de conv pourrait reprendre depuis un
    // ancien `lastFetchedAt` et manquer des messages reçus entre temps.
    lastFetchedAtRef.current.delete(activeId);
    fetchMessages(activeId);
  }, [activeId, fetchMessages]);

  // Polling incrémental des messages de la conv active (gated sur visibilité)
  useEffect(() => {
    if (!activeId) return;
    const id = setInterval(() => {
      if (isPageHidden() || !activeId) return;
      fetchMessages(activeId, { silent: true, incremental: true });
    }, POLL_MESSAGES_MS);
    return () => clearInterval(id);
  }, [activeId, fetchMessages]);

  // Catch-up immédiat quand l'utilisateur revient sur l'onglet :
  // refetch list + messages incrémental pour rattraper les minutes off-screen.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) return;
      fetchList(true);
      if (activeId) {
        fetchMessages(activeId, { silent: true, incremental: true });
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeId, fetchList, fetchMessages]);

  /* ─── Création d'une conv ──────────────────────────────────────── */
  async function handleCreateConversation(payload: {
    memberIds: string[];
    name: string | null;
  }) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Erreur création conversation");
    }
    const data = (await res.json()) as { conversationId: string };
    setNewOpen(false);
    await fetchList();
    setActiveId(data.conversationId);
  }

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
          {isAdmin && (
            <button
              onClick={() => setShadowMode((s) => !s)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition",
                shadowMode
                  ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
              title="Voir toutes les conversations de la pharmacie (modération)"
            >
              <Eye className="h-3 w-3" />
              {shadowMode ? "Mode modération" : "Mes conversations"}
            </button>
          )}
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle
        </Button>
      </div>

      {/* Layout 2-panes */}
      <div className="flex flex-1 min-h-0">
        <aside
          className={cn(
            "w-full md:w-80 shrink-0 border-r border-border bg-card overflow-y-auto",
            activeId && "hidden md:block"
          )}
        >
          <ConversationList
            conversations={conversations}
            currentUserId={currentUser.id}
            activeId={activeId}
            onSelect={setActiveId}
            loading={loadingList}
          />
        </aside>

        <main className={cn("flex-1 min-w-0", !activeId && "hidden md:flex md:items-center md:justify-center")}>
          {activeConv ? (
            <ConversationPanel
              conversation={activeConv}
              messages={messages}
              loading={loadingMessages}
              currentUser={currentUser}
              shadowAccess={activeShadow}
              onBack={() => setActiveId(null)}
              onMessageSent={() => fetchMessages(activeConv.id, { silent: true })}
              onSwapUpdated={() => fetchMessages(activeConv.id, { silent: true })}
            />
          ) : (
            <div className="hidden md:block text-sm text-zinc-400">
              Sélectionne une conversation ou crée-en une nouvelle.
            </div>
          )}
        </main>
      </div>

      <NewConversationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        contacts={contacts}
        onCreate={handleCreateConversation}
      />
    </div>
  );
}
