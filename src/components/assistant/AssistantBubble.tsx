"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HygieLogo } from "@/components/assistant/HygieLogo";

type Msg = { role: "user" | "assistant"; content: string };
type PendingAction = { tool: string; args: Record<string, unknown>; summary: string };

/**
 * Bulle d'assistante IA « Hygie » — flotte en bas à droite sur toutes les pages
 * connectées. Aide l'équipe à comprendre / utiliser PharmaPlanning, et peut
 * effectuer certaines actions (poser une absence, signaler une dispo…).
 *
 * La conversation part au serveur (/api/assistant → Groq) ; la clé reste côté
 * serveur. Les actions qui modifient des données demandent une CONFIRMATION
 * (boutons) avant d'être exécutées.
 */
export function AssistantBubble({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const greeting = `Bonjour ${firstName || ""} 👋 Je suis Hygie, ton assistante. Pose ta question sur le planning ou l'appli : je t'explique tout et je peux même t'aider pour certaines choses.`;

  // Auto-scroll vers le bas à chaque nouveau message / pendant la frappe.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading, pending]);

  // Focus l'input à l'ouverture.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setPending(null); // nouvelle question → on abandonne toute action en attente
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json().catch(() => null)) as
        | { reply?: string; pendingAction?: PendingAction }
        | null;
      const reply = data?.reply ?? "Désolé, je n'ai pas pu répondre. Réessaie.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      if (data?.pendingAction) setPending(data.pendingAction);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Connexion échouée. Réessaie." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction() {
    if (!pending || loading) return;
    const p = pending;
    setPending(null);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: { tool: p.tool, args: p.args } }),
      });
      const data = (await res.json().catch(() => null)) as { reply?: string } | null;
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data?.reply ?? "C'est fait." },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "L'action a échoué. Réessaie." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function cancelAction() {
    setPending(null);
    setMessages((m) => [
      ...m,
      { role: "assistant", content: "Ok, c'est annulé, rien n'a été fait. 👍" },
    ]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <>
      {/* Bouton flottant */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistant"
          className={cn(
            "no-print fixed right-4 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full",
            "bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-6",
            "bg-emerald-600 text-white shadow-[0_8px_24px_-4px_rgba(5,150,105,0.45)]",
            "transition-transform hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
          )}
        >
          <HygieLogo className="h-7 w-7" />
        </button>
      )}

      {/* Panneau de chat */}
      {open && (
        <div
          className={cn(
            "no-print fixed right-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_48px_-8px_rgba(0,0,0,0.3)]",
            "bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-6",
            "w-[min(380px,calc(100vw-2rem))] h-[min(560px,calc(100dvh-8rem))]"
          )}
          role="dialog"
          aria-label="Assistant PharmaPlanning"
        >
          {/* En-tête */}
          <div className="flex items-center gap-2.5 border-b border-border bg-emerald-600 px-4 py-3 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <HygieLogo className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight">Hygie</p>
              <p className="text-[11px] text-white/80 leading-tight">
                Assistante PharmaPlanning
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 scrollbar-thin"
          >
            <Bubble role="assistant" content={greeting} />
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}
            {loading && <Bubble role="assistant" content="…" typing />}

            {/* Carte de confirmation d'action (avant exécution) */}
            {pending && !loading && (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="mb-2 text-[12.5px] font-medium text-emerald-900 dark:text-emerald-200">
                  {pending.summary}, confirmer ?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void confirmAction()}
                    className="h-8 flex-1 rounded-lg bg-emerald-600 text-[13px] font-medium text-white hover:bg-emerald-700"
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={cancelAction}
                    className="h-8 flex-1 rounded-lg border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Saisie */}
          <div className="border-t border-border p-2.5">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Écris ta question…"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!input.trim() || loading}
                aria-label="Envoyer"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-muted-foreground/70">
              Pilou peut se tromper — en cas de doute, demande à ton titulaire.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({
  role,
  content,
  typing,
}: {
  role: "user" | "assistant";
  content: string;
  typing?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed",
          isUser
            ? "bg-emerald-600 text-white rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
          typing && "animate-pulse text-muted-foreground"
        )}
      >
        {content}
      </div>
    </div>
  );
}
