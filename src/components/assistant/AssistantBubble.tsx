"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HygieLogo } from "@/components/assistant/HygieLogo";

type Msg = { role: "user" | "assistant"; content: string };
type PendingAction = { tool: string; args: Record<string, unknown>; summary: string };

/**
 * Bulle d'assistante IA « Hygie » — flotte en bas à droite sur toutes les pages
 * connectées. Deux casquettes : elle aide l'équipe à comprendre / utiliser
 * PharmaPlanning (avec des liens cliquables vers les bonnes pages) et sert
 * d'aide-mémoire pharmaceutique (médicaments, classes, précautions).
 *
 * La conversation part au serveur (/api/assistant → Groq) ; la clé reste côté
 * serveur. Les actions qui modifient des données demandent une CONFIRMATION
 * (boutons) avant d'être exécutées.
 */
export function AssistantBubble({
  firstName,
  role,
}: {
  firstName: string;
  role?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const greeting = `Bonjour ${firstName || ""} 👋 Je suis Hygie, ton assistante. Je t'aide à utiliser l'appli (je peux même te poser des choses directement) et je réponds à tes questions pharma : médicaments, classes, précautions à connaître. Pose ta question, ou choisis ci-dessous.`;

  // Suggestions de départ, adaptées au rôle (mélange appli + pharma).
  const suggestions = useMemo(() => buildSuggestions(role), [role]);

  // Ouvre une page interne (lien cliquable dans une réponse) et referme la bulle.
  function goTo(href: string) {
    setOpen(false);
    router.push(href);
  }

  // Auto-scroll vers le bas à chaque nouveau message / pendant la frappe.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading, pending]);

  // Focus l'input à l'ouverture.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
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

  const showSuggestions = messages.length === 0 && !loading && !pending;

  return (
    <>
      {/* Bouton flottant */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistante Hygie"
          className={cn(
            "no-print fixed right-4 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full",
            "bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-6",
            "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
            "shadow-[0_8px_24px_-4px_rgba(5,150,105,0.5)] ring-1 ring-white/20",
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
            "w-[min(390px,calc(100vw-2rem))] h-[min(580px,calc(100dvh-8rem))]"
          )}
          role="dialog"
          aria-label="Assistante Hygie"
        >
          {/* En-tête */}
          <div className="flex items-center gap-2.5 border-b border-black/10 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/25">
              <HygieLogo className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight">Hygie</p>
              <p className="text-[11px] text-white/85 leading-tight">
                Aide appli + repères pharma
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
            <Bubble role="assistant" content={greeting} onNavigate={goTo} />
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} onNavigate={goTo} />
            ))}
            {loading && <Bubble role="assistant" content="…" typing onNavigate={goTo} />}

            {/* Suggestions de départ (cliquables) */}
            {showSuggestions && (
              <div className="flex flex-col gap-1.5 pt-1">
                <p className="flex items-center gap-1 px-1 text-[11px] font-medium text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> Exemples de questions
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-left text-[12.5px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

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
              Hygie donne des repères et peut se tromper : pour une dispensation,
              vérifie la source officielle ; en cas de doute sur l'appli, demande
              à ton titulaire.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/** Suggestions de départ selon le rôle (mélange usage appli + questions pharma). */
function buildSuggestions(role?: string): string[] {
  const isAdmin = role === "ADMIN" || role === "CREATEUR" || role === "MANAGEUR";
  const pharma = [
    "Précautions avant de conseiller un AINS ?",
    "C'est quoi la classe des IPP et les points de vigilance ?",
  ];
  if (isAdmin) {
    return [
      "Comment appliquer un gabarit de semaine ?",
      "À quoi sert la colonne EFF du planning ?",
      ...pharma,
    ];
  }
  return [
    "Comment poser un congé ?",
    "Où voir mes heures de la semaine ?",
    ...pharma,
  ];
}

function Bubble({
  role,
  content,
  typing,
  onNavigate,
}: {
  role: "user" | "assistant";
  content: string;
  typing?: boolean;
  onNavigate: (href: string) => void;
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
        {isUser || typing ? content : <RichText content={content} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}

// Reconnaît les liens Markdown [texte](url) et le **gras** dans les réponses.
const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/**
 * Rend une réponse d'Hygie avec ses liens cliquables (interne = navigation dans
 * l'app + fermeture de la bulle ; externe = nouvel onglet) et son gras. Pas de
 * `dangerouslySetInnerHTML` : on construit des nœuds React, donc rien n'est
 * injecté tel quel.
 */
function RichText({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate: (href: string) => void;
}) {
  const lines = content.split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>
          {parseInline(line, onNavigate)}
          {li < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function parseInline(text: string, onNavigate: (href: string) => void) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined && m[2] !== undefined) {
      const label = m[1];
      const href = m[2];
      if (href.startsWith("/")) {
        nodes.push(
          <button
            key={key++}
            type="button"
            onClick={() => onNavigate(href)}
            className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            {label}
          </button>
        );
      } else {
        nodes.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            {label}
            <ExternalLink className="h-3 w-3" />
          </a>
        );
      }
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={key++}>{m[3]}</strong>);
    }
    last = TOKEN.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
