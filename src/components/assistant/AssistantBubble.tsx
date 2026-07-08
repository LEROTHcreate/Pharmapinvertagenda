"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pill, RotateCcw, Send, Sparkles, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HygieLogo } from "@/components/assistant/HygieLogo";

type Msg = { role: "user" | "assistant"; content: string };
type PendingAction = { tool: string; args: Record<string, unknown>; summary: string };

/** Découpe en forme de croix (croix de pharmacie) — branches ~32% d'épaisseur. */
const CROSS_CLIP =
  "polygon(34% 0%, 66% 0%, 66% 34%, 100% 34%, 100% 66%, 66% 66%, 66% 100%, 34% 100%, 34% 66%, 0% 66%, 0% 34%, 34% 34%)";

// Persistance locale de la conversation. On garde l'échange du JOUR (clé unique,
// réinitialisée chaque jour) pour ne pas perdre l'historique en rechargeant la
// page ou en fermant/rouvrant l'onglet — sans traîner une conversation périmée.
const STORAGE_KEY = "hygie_chat_v1";
const MAX_STORED = 40;

/** Clé de jour (locale) pour dater la conversation sauvegardée. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

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
  // Petit conseil qui surgit tout seul de temps en temps (quand la bulle est
  // fermée) puis disparaît après quelques secondes.
  const [nudge, setNudge] = useState<string | null>(null);
  // Animation de clic sur la croix (tournoie + rebondit) avant d'ouvrir le chat.
  const [popping, setPopping] = useState(false);
  // Erreur réseau de la dernière requête (bannière + réessai), null sinon.
  const [error, setError] = useState<string | null>(null);
  // Contrôleur d'annulation de la requête en cours (bouton Stop).
  const abortRef = useRef<AbortController | null>(null);
  // Passe à true une fois l'historique restauré → évite d'écraser le storage
  // avec un tableau vide au tout premier rendu (avant chargement).
  const restored = useRef(false);

  // Clic sur la croix : joue le petit "pop" puis ouvre la bulle.
  function openWithPop() {
    if (popping) return;
    setNudge(null);
    setPopping(true);
    window.setTimeout(() => {
      setOpen(true);
      setPopping(false);
    }, 300);
  }
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

  // Restaure la conversation du jour au montage (client uniquement). Une
  // conversation d'un autre jour est écartée (repart propre chaque matin).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { day?: string; messages?: Msg[] };
        if (saved.day === todayKey() && Array.isArray(saved.messages)) {
          setMessages(saved.messages.slice(-MAX_STORED));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      /* storage indisponible / JSON corrompu → on démarre à vide */
    }
    restored.current = true;
  }, []);

  // Sauvegarde à chaque évolution de la conversation (après restauration).
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (messages.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ day: todayKey(), messages: messages.slice(-MAX_STORED) })
        );
      }
    } catch {
      /* quota dépassé → on ignore, la conversation reste en mémoire */
    }
  }, [messages]);

  // Coupe la requête en cours (bouton Stop).
  function stop() {
    abortRef.current?.abort();
  }

  // Repart d'une conversation vierge : coupe l'éventuelle requête, vide l'écran
  // et le stockage local.
  function newConversation() {
    abortRef.current?.abort();
    setMessages([]);
    setPending(null);
    setError(null);
    setInput("");
    setLoading(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Interactions aléatoires : quand la bulle est fermée, Hygie glisse parfois un
  // petit conseil/coup de pouce qui reste quelques secondes puis s'efface, à des
  // intervalles irréguliers (jamais spammé). Toute ouverture le masque.
  useEffect(() => {
    if (open) {
      setNudge(null);
      return;
    }
    const tips = buildNudges(role);
    if (tips.length === 0) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    let nextTimer: ReturnType<typeof setTimeout>;
    let lastIdx = -1;
    // Tire un conseil : ~1 fois sur 4 un message lié au MOMENT de la journée
    // (calculé à l'affichage), sinon le répertoire — jamais deux fois le même
    // d'affilée.
    function pick(): string {
      if (Math.random() < 0.28) {
        const t = timeOfDayNudge();
        if (t) return t;
      }
      let i = Math.floor(Math.random() * tips.length);
      if (tips.length > 1 && i === lastIdx) i = (i + 1) % tips.length;
      lastIdx = i;
      return tips[i];
    }
    function schedule(first: boolean) {
      // 1er conseil ~20-40 s après l'arrivée, puis toutes les ~1,5-3 min.
      const delay = first
        ? 20000 + Math.random() * 20000
        : 90000 + Math.random() * 90000;
      nextTimer = setTimeout(() => {
        setNudge(pick());
        hideTimer = setTimeout(() => setNudge(null), 9000);
        schedule(false);
      }, delay);
    }
    schedule(true);
    return () => {
      clearTimeout(nextTimer);
      clearTimeout(hideTimer);
    };
  }, [open, role]);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || loading) return;
    setPending(null); // nouvelle question → on abandonne toute action en attente
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as
        | { reply?: string; pendingAction?: PendingAction }
        | null;
      const reply = data?.reply ?? "Désolé, je n'ai pas pu répondre. Réessaie.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      if (data?.pendingAction) setPending(data.pendingAction);
    } catch {
      // Interruption volontaire OU erreur réseau : on retire la question restée
      // sans réponse et on la remet dans le champ pour un renvoi immédiat.
      setMessages((m) => m.slice(0, -1));
      setInput(text);
      if (!controller.signal.aborted) setError("Connexion échouée. Réessaie.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function confirmAction() {
    if (!pending || loading) return;
    const p = pending;
    setPending(null);
    setError(null);
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
      {/* Conseil surgissant (aléatoire, s'efface tout seul) — au-dessus du bouton */}
      {!open && nudge && (
        <div
          className={cn(
            "no-print fixed right-4 z-50 w-[min(240px,calc(100vw-2.5rem))]",
            "bottom-[calc(72px+env(safe-area-inset-bottom,0px)+76px)] md:bottom-[98px]",
            "animate-in fade-in slide-in-from-bottom-2 duration-300"
          )}
        >
          <div className="relative rounded-2xl rounded-br-md border border-emerald-200 bg-card px-3 py-2.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)] dark:border-emerald-800/60">
            <button
              type="button"
              onClick={() => setNudge(null)}
              aria-label="Fermer le conseil"
              className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/50 hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setNudge(null);
                setOpen(true);
              }}
              className="block w-full pr-4 text-left"
            >
              <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <HygieLogo className="h-3 w-3" />
                Hygie
              </span>
              <span className="text-[12.5px] leading-snug text-foreground">
                {nudge}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Bouton flottant EN FORME DE CROIX (croix de pharmacie) — croix verte
          avec la croix blanche au centre = emblème pharmacie. La forme est
          obtenue par clip-path ; l'ombre suit la découpe via drop-shadow. */}
      {!open && (
        <button
          type="button"
          onClick={openWithPop}
          aria-label="Ouvrir l'assistante Hygie"
          title="Hygie — ton assistante"
          className={cn(
            "no-print fixed right-4 z-50 inline-flex h-16 w-16 items-center justify-center",
            "bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-6",
            "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
            "transition-transform hover:scale-105 active:scale-95",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500",
            popping && "hygie-pop"
          )}
          style={{
            clipPath: CROSS_CLIP,
            filter: "drop-shadow(0 6px 12px rgba(5,150,105,0.45))",
          }}
        >
          <HygieLogo className="h-7 w-7 text-white/95" />
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
            {messages.length > 0 && (
              <button
                type="button"
                onClick={newConversation}
                aria-label="Nouvelle conversation"
                title="Nouvelle conversation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Outil : recherche médicament sur la base publique (BDPM) */}
          <MedicamentSearch />

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
            {/* Bannière d'erreur réseau avec réessai en un clic */}
            {error && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                <span className="min-w-0 flex-1">{error}</span>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!input.trim() || loading}
                  className="shrink-0 rounded-md bg-rose-600 px-2 py-0.5 text-[11.5px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  Réessayer
                </button>
              </div>
            )}
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
              {loading ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Arrêter la réponse"
                  title="Arrêter la réponse"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white transition-colors hover:bg-rose-700"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!input.trim()}
                  aria-label="Envoyer"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
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

function pickOne(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Message lié au MOMENT de la journée (calculé à l'affichage, heure locale).
 * Rend Hygie « présente » : bonjour le matin, pause le midi, bonne fin de
 * journée le soir… Volontairement générique (pas de dépendance au rôle).
 */
function timeOfDayNudge(): string | null {
  const h = new Date().getHours();
  if (h >= 6 && h < 11)
    return pickOne([
      "Bonne journée à l'équipe ☀️",
      "Prêt·e pour la journée ? Je reste dans le coin 🙂",
      "Un café et c'est parti ☕ — pose-moi une question quand tu veux.",
    ]);
  if (h >= 11 && h < 14)
    return pickOne([
      "Pense à souffler un peu à la pause 🥪",
      "C'est l'heure de pointe du midi — garde un œil sur le comptoir.",
    ]);
  if (h >= 14 && h < 18)
    return pickOne([
      "Bel après-midi 👋 Une question ? Je suis là.",
      "L'après-midi peut charger — un œil sur l'effectif du jour ?",
    ]);
  if (h >= 18 && h < 22)
    return pickOne([
      "Bientôt la fermeture — bonne fin de journée 🌆",
      "Fin de journée : pense à jeter un œil au planning de demain 📋",
    ]);
  // Nuit / très tôt
  return pickOne([
    "Encore là à cette heure ? Ne te couche pas trop tard 🌙",
    "Nuit calme ? Je veille aussi 🌙",
  ]);
}

/**
 * Répertoire des petits conseils surgissants d'Hygie (tirés au hasard), adaptés
 * au rôle. Trois familles : astuces sur l'appli (fonctions réelles), repères
 * pharma (formulés comme des invitations à me poser la question — pas de conseil
 * médical asséné) et quelques touches « perso » pour rendre Hygie vivante.
 */
function buildNudges(role?: string): string[] {
  const isAdmin = role === "ADMIN" || role === "CREATEUR" || role === "MANAGEUR";

  // Repères pharma — invitations à demander (Hygie répond quand on l'interroge).
  const pharma = [
    "Un patient sous AINS + anticoagulant ? Demande-moi les points de vigilance 💊",
    "Envie de réviser une classe (IPP, IEC, ARA2, statines, β-bloquants…) ? Je te fais un topo.",
    "Un doute sur une interaction médicamenteuse ? Pose-la-moi, je regarde.",
    "Une idée de conseil associé pour accompagner une ordonnance ? Demande-moi.",
    "Posologie ou précaution chez la femme enceinte / l'enfant ? Je te donne les repères.",
    "Quels signaux d'alerte orienter vers le médecin ? Demande-moi la liste.",
    "Antibio et alcool, soleil et certains médicaments… tu veux les grands pièges ? Demande.",
  ];

  // Touches perso / encouragement — léger, humain.
  const vibe = [
    "Je reste dans le coin si tu as une question 🙂",
    "Parle-moi normalement : je comprends les questions du quotidien.",
    "Je peux te faire gagner du temps — teste-moi sur une vraie question !",
    "Belle journée à l'équipe 👋",
    "Perdu dans un menu ? Demande-moi « où je trouve… » et je t'y emmène.",
  ];

  const common = [
    "Tu peux me poser une question sur l'appli ET sur la pharma, au même endroit.",
    ...vibe,
    ...pharma,
  ];

  if (isAdmin) {
    return [
      "Astuce : applique un gabarit pour remplir une semaine entière en un clic ✨",
      "Sur le planning, copie-colle des postes d'un jour à l'autre (Ctrl+C / Ctrl+V).",
      "Ctrl+Z / Ctrl+Y annulent et rétablissent tes modifs de planning.",
      "Marque un gabarit « par défaut » (⭐) : il sera pré-sélectionné à l'application.",
      "Besoin d'un gabarit vite fait ? Importe une semaine déjà planifiée.",
      "Surveille la colonne EFF : elle t'alerte quand un créneau est en sous-effectif.",
      "Glisse-dépose une case du planning pour déplacer un poste en un geste.",
      "Ajoute un repas d'équipe ou une animation dans « Équipe » — ça soude le groupe 🎉",
      "Tu peux changer le rôle de chacun directement depuis la page « Équipe ».",
      "L'accueil te montre l'effectif du jour et l'affluence par créneau d'un coup d'œil.",
      "Pense à traiter les demandes en attente (le badge du menu te les signale).",
      "Je peux préparer une action pour toi (ex. poser une absence) — je te la fais confirmer d'abord.",
      ...common,
    ];
  }

  return [
    "Pense à poser tes congés à l'avance dans « Absences & dispos ».",
    "Retrouve tes heures de la semaine et ta journée sur l'accueil.",
    "Indique tes disponibilités : ça aide à faire un planning qui t'arrange.",
    "Un message pour un collègue ou le titulaire ? C'est dans « Messages ».",
    "Qui est de garde bientôt ? La prochaine garde s'affiche sur ton accueil.",
    "Besoin de noter un truc à ne pas oublier ? Il y a « Notes ».",
    ...common,
  ];
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

/**
 * Recherche médicament — ouvre la fiche du médicament sur la Base de données
 * publique des médicaments (BDPM, ANSM/gouv). Pré-remplit la recherche par nom.
 * Barre compacte sous l'en-tête d'Hygie, toujours disponible.
 */
function MedicamentSearch() {
  const [q, setQ] = useState("");
  const term = q.trim();

  function openBdpm() {
    if (!term) return;
    const url =
      "https://base-donnees-publique.medicaments.gouv.fr/index.php?page=liste&choixRecherche=medicament&nom=" +
      encodeURIComponent(term);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        openBdpm();
      }}
      className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2"
    >
      <Pill className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un médicament (base publique)…"
        aria-label="Rechercher un médicament sur la base de données publique"
        className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        disabled={!term}
        title="Ouvrir la fiche sur la base publique des médicaments (ANSM)"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
      >
        <ExternalLink className="h-3 w-3" aria-hidden /> Ouvrir
      </button>
    </form>
  );
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
