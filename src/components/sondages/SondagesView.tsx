"use client";

import { useEffect, useState } from "react";
import {
  BarChart2,
  Plus,
  Check,
  Trash2,
  Loader2,
  Lock,
  Unlock,
  X,
  Users,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Voter = { id: string; name: string; color: string };

type Poll = {
  id: string;
  question: string;
  options: string[];
  status: "OPEN" | "CLOSED";
  createdAt: string;
  closesAt: string | null;
  totalVotes: number;
  counts: Record<string, number>;
  voters: Record<string, Voter[]> | null;
  myChoice: string | null;
};

export function SondagesView({
  canManage,
  canVote,
}: {
  canManage: boolean;
  canVote: boolean;
}) {
  const { toast } = useToast();
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/polls");
      const d = await res.json();
      setPolls(res.ok ? d.polls ?? [] : []);
    } catch {
      setPolls([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function vote(p: Poll, choice: string) {
    if (!canVote) {
      toast({ tone: "error", title: "Vote impossible", description: "Ton compte n'est pas rattaché à un profil de l'équipe." });
      return;
    }
    setBusyId(p.id);
    // Optimiste : maj immédiate de mon choix + compteurs.
    setPolls((prev) =>
      prev?.map((x) => {
        if (x.id !== p.id) return x;
        const counts = { ...x.counts };
        if (x.myChoice && counts[x.myChoice] > 0) counts[x.myChoice]--;
        counts[choice] = (counts[choice] ?? 0) + 1;
        const totalVotes = x.myChoice ? x.totalVotes : x.totalVotes + 1;
        return { ...x, counts, myChoice: choice, totalVotes };
      }) ?? prev
    );
    try {
      const res = await fetch(`/api/polls/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "vote", choice }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast({ tone: "error", title: "Vote impossible", description: e.error ?? "Réessaie." });
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function act(p: Poll, action: "close" | "reopen") {
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/polls/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(p: Poll) {
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/polls/${p.id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full p-3 md:p-4 lg:p-6 pb-16 max-w-3xl mx-auto">
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          <BarChart2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Sondages express</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {canManage
              ? "Posez une question à l'équipe, chacun répond en un tap."
              : "Répondez aux questions de l'équipe en un tap."}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" /> Nouveau sondage
          </button>
        )}
      </header>

      {canManage && creating && (
        <CreateForm
          onDone={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}

      {polls === null ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : polls.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <BarChart2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-[14px] font-medium text-foreground">Aucun sondage</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
            {canManage
              ? "Lancez un sondage : « Qui peut venir samedi ? », « Repas d'équipe jeudi ou vendredi ? »…"
              : "Rien à voter pour l'instant."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {polls.map((p) => (
            <PollCard
              key={p.id}
              poll={p}
              canManage={canManage}
              canVote={canVote}
              busy={busyId === p.id}
              onVote={(c) => vote(p, c)}
              onClose={() => act(p, "close")}
              onReopen={() => act(p, "reopen")}
              onRemove={() => remove(p)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PollCard({
  poll: p,
  canManage,
  canVote,
  busy,
  onVote,
  onClose,
  onReopen,
  onRemove,
}: {
  poll: Poll;
  canManage: boolean;
  canVote: boolean;
  busy: boolean;
  onVote: (choice: string) => void;
  onClose: () => void;
  onReopen: () => void;
  onRemove: () => void;
}) {
  const [showVoters, setShowVoters] = useState(false);
  const isOpen = p.status === "OPEN";
  const max = Math.max(1, ...p.options.map((o) => p.counts[o] ?? 0));

  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">{p.question}</h2>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
            isOpen
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isOpen ? "Ouvert" : "Clôturé"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {p.options.map((o) => {
          const count = p.counts[o] ?? 0;
          const pctBar = (count / max) * 100;
          const pctTot = p.totalVotes > 0 ? Math.round((count / p.totalVotes) * 100) : 0;
          const mine = p.myChoice === o;
          return (
            <div key={o}>
              <button
                onClick={() => isOpen && canVote && onVote(o)}
                disabled={!isOpen || !canVote || busy}
                className={cn(
                  "group relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors",
                  mine
                    ? "border-violet-400 dark:border-violet-600"
                    : "border-border",
                  isOpen && canVote ? "cursor-pointer hover:border-violet-300" : "cursor-default"
                )}
              >
                {/* Barre de progression (fond) */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-lg transition-all",
                    mine ? "bg-violet-100 dark:bg-violet-950/40" : "bg-muted/60"
                  )}
                  style={{ width: `${pctBar}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground">
                    {mine && <Check className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
                    {o}
                  </span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {count} · {pctTot}%
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
        <span>
          {p.totalVotes} réponse{p.totalVotes > 1 ? "s" : ""}
        </span>
        {!canVote && isOpen && (
          <span className="text-amber-600 dark:text-amber-400">
            (profil non rattaché — vote indisponible)
          </span>
        )}
        {canManage && p.voters && (
          <button
            onClick={() => setShowVoters((v) => !v)}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Users className="h-3.5 w-3.5" /> {showVoters ? "Masquer" : "Voir qui a répondu"}
          </button>
        )}
        {canManage && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={isOpen ? onClose : onReopen}
              disabled={busy}
              title={isOpen ? "Clôturer" : "Rouvrir"}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/60 disabled:opacity-60"
            >
              {isOpen ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {isOpen ? "Clôturer" : "Rouvrir"}
            </button>
            <button
              onClick={onRemove}
              disabled={busy}
              title="Supprimer"
              className="rounded-md p-1.5 hover:bg-muted/60 hover:text-red-600 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Détail des votants (manageur+) */}
      {canManage && p.voters && showVoters && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          {p.options.map((o) => (
            <div key={o} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-medium text-muted-foreground min-w-[80px]">{o}</span>
              {(p.voters?.[o] ?? []).length === 0 ? (
                <span className="text-[12px] text-muted-foreground/60">—</span>
              ) : (
                (p.voters?.[o] ?? []).map((v) => (
                  <span
                    key={v.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[12px]"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: v.color }} />
                    {v.name}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

const PRESETS = [
  { label: "Oui / Non / Peut-être", options: ["Oui", "Non", "Peut-être"] },
  { label: "Matin / Après-midi / Journée", options: ["Matin", "Après-midi", "Journée"] },
];

function CreateForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["Oui", "Non", "Peut-être"]);
  const [busy, setBusy] = useState(false);

  function setOpt(i: number, v: string) {
    setOptions((prev) => prev.map((o, k) => (k === i ? v : o)));
  }
  function addOpt() {
    if (options.length < 6) setOptions((prev) => [...prev, ""]);
  }
  function removeOpt(i: number) {
    if (options.length > 2) setOptions((prev) => prev.filter((_, k) => k !== i));
  }

  async function submit() {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length < 3) {
      toast({ tone: "error", title: "Question trop courte", description: "Formule ta question." });
      return;
    }
    if (new Set(clean).size < 2) {
      toast({ tone: "error", title: "Choix insuffisants", description: "Au moins 2 choix distincts." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.trim(), options: clean }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ tone: "error", title: "Création impossible", description: d.error ?? "Réessaie." });
      } else {
        setQuestion("");
        setOptions(["Oui", "Non", "Peut-être"]);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4 dark:border-violet-900/40 dark:bg-violet-950/10">
      <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
        Question
        <input
          type="text"
          value={question}
          maxLength={200}
          placeholder="Ex. Qui peut venir samedi matin ?"
          onChange={(e) => setQuestion(e.target.value)}
          className="rounded-lg border border-input bg-card px-2.5 py-2 text-[14px] text-foreground"
        />
      </label>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-medium text-muted-foreground">Choix</span>
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setOptions(p.options)}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={o}
                maxLength={60}
                placeholder={`Choix ${i + 1}`}
                onChange={(e) => setOpt(i, e.target.value)}
                className="flex-1 rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground"
              />
              {options.length > 2 && (
                <button
                  onClick={() => removeOpt(i)}
                  title="Retirer"
                  className="rounded-md p-1.5 text-muted-foreground/60 hover:bg-muted/50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 6 && (
          <button
            onClick={addOpt}
            className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter un choix
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Lancer le sondage
        </button>
      </div>
    </div>
  );
}
