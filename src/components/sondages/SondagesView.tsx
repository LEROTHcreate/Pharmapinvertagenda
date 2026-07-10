"use client";

import { useEffect, useMemo, useState } from "react";
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
  BellRing,
  Trophy,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; color: string };

type Poll = {
  id: string;
  question: string;
  options: string[];
  status: "OPEN" | "CLOSED";
  createdAt: string;
  closesAt: string | null;
  totalVotes: number;
  counts: Record<string, number>;
  voters: Record<string, Person[]> | null;
  nonVoters: Person[] | null;
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
  const [teamSize, setTeamSize] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/polls");
      const d = await res.json();
      if (res.ok) {
        setPolls(d.polls ?? []);
        setTeamSize(d.teamSize ?? 0);
      } else setPolls([]);
    } catch {
      setPolls([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const open = useMemo(() => (polls ?? []).filter((p) => p.status === "OPEN"), [polls]);
  const closed = useMemo(() => (polls ?? []).filter((p) => p.status !== "OPEN"), [polls]);

  async function vote(p: Poll, choice: string) {
    if (!canVote) {
      toast({ tone: "error", title: "Vote impossible", description: "Ton compte n'est pas rattaché à un profil de l'équipe." });
      return;
    }
    setBusyId(p.id);
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

  async function remind(p: Poll) {
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/polls/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remind" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          tone: "success",
          title: "Relance envoyée",
          description:
            d.sent > 0
              ? `${d.sent} notification${d.sent > 1 ? "s" : ""} poussée${d.sent > 1 ? "s" : ""}.`
              : `${d.reminded ?? 0} personne(s) à relancer (aucune n'a activé les notifications).`,
        });
      } else {
        toast({ tone: "error", title: "Relance impossible", description: d.error ?? "Réessaie." });
      }
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

  const cardProps = (p: Poll) => ({
    poll: p,
    teamSize,
    canManage,
    canVote,
    busy: busyId === p.id,
    onVote: (c: string) => vote(p, c),
    onClose: () => act(p, "close"),
    onReopen: () => act(p, "reopen"),
    onRemind: () => remind(p),
    onRemove: () => remove(p),
  });

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-6">
      {/* En-tête pleine largeur */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <BarChart2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Sondages express</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {canManage
                ? "Posez une question à l'équipe — chacun répond en un tap, vous suivez la participation en direct."
                : "Répondez aux questions de l'équipe en un tap."}
            </p>
          </div>
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
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : polls.length === 0 ? (
        <EmptyState canManage={canManage} onCreate={() => setCreating(true)} />
      ) : (
        <div className="space-y-6">
          <Section label="En cours" count={open.length}>
            {open.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
                Aucun sondage en cours. 👌
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {open.map((p) => (
                  <PollCard key={p.id} {...cardProps(p)} />
                ))}
              </div>
            )}
          </Section>

          {closed.length > 0 && (
            <Section label="Clôturés" count={closed.length}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {closed.map((p) => (
                  <PollCard key={p.id} {...cardProps(p)} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2.5 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
        {label} ({count})
      </h2>
      {children}
    </section>
  );
}

function EmptyState({ canManage, onCreate }: { canManage: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <BarChart2 className="mx-auto h-9 w-9 text-muted-foreground/50" />
      <p className="mt-3 text-[15px] font-medium text-foreground">Aucun sondage</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
        {canManage
          ? "Lancez un sondage express : « Qui peut venir samedi ? », « Repas d'équipe jeudi ou vendredi ? »… L'équipe répond en un tap."
          : "Rien à voter pour l'instant. Repassez plus tard."}
      </p>
      {canManage && (
        <button
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" /> Créer un sondage
        </button>
      )}
    </div>
  );
}

function PollCard({
  poll: p,
  teamSize,
  canManage,
  canVote,
  busy,
  onVote,
  onClose,
  onReopen,
  onRemind,
  onRemove,
}: {
  poll: Poll;
  teamSize: number;
  canManage: boolean;
  canVote: boolean;
  busy: boolean;
  onVote: (choice: string) => void;
  onClose: () => void;
  onReopen: () => void;
  onRemind: () => void;
  onRemove: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const isOpen = p.status === "OPEN";
  const max = Math.max(1, ...p.options.map((o) => p.counts[o] ?? 0));
  const winner = p.totalVotes > 0 ? p.options.reduce((a, b) => ((p.counts[b] ?? 0) > (p.counts[a] ?? 0) ? b : a)) : null;
  const participation = teamSize > 0 ? Math.min(1, p.totalVotes / teamSize) : 0;
  const nonVoterCount = p.nonVoters?.length ?? Math.max(0, teamSize - p.totalVotes);

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold leading-snug text-foreground">{p.question}</h3>
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

      {/* Participation */}
      <div className="mt-2.5">
        <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
          <span>
            <strong className="text-foreground tabular-nums">{p.totalVotes}</strong>
            {teamSize > 0 ? ` / ${teamSize}` : ""} réponse{p.totalVotes > 1 ? "s" : ""}
          </span>
          {teamSize > 0 && <span className="tabular-nums">{Math.round(participation * 100)}%</span>}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${participation * 100}%` }}
          />
        </div>
      </div>

      {/* Résultats / vote */}
      <div className="mt-3 space-y-2">
        {p.options.map((o) => {
          const count = p.counts[o] ?? 0;
          const pctBar = (count / max) * 100;
          const pctTot = p.totalVotes > 0 ? Math.round((count / p.totalVotes) * 100) : 0;
          const mine = p.myChoice === o;
          const isWinner = winner === o && count > 0;
          return (
            <button
              key={o}
              onClick={() => isOpen && canVote && onVote(o)}
              disabled={!isOpen || !canVote || busy}
              className={cn(
                "group relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors",
                mine ? "border-violet-400 dark:border-violet-600" : "border-border",
                isOpen && canVote ? "cursor-pointer hover:border-violet-300" : "cursor-default"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 rounded-lg transition-all",
                  isWinner
                    ? "bg-emerald-100 dark:bg-emerald-950/40"
                    : mine
                      ? "bg-violet-100 dark:bg-violet-950/40"
                      : "bg-muted/60"
                )}
                style={{ width: `${pctBar}%` }}
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium text-foreground">
                  {mine && <Check className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />}
                  {isWinner && !mine && (
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="truncate">{o}</span>
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {count} · {pctTot}%
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Pied de carte */}
      <div className="mt-auto pt-3">
        {!canVote && isOpen && (
          <p className="mb-2 text-[11.5px] text-amber-600 dark:text-amber-400">
            Profil non rattaché — vote indisponible.
          </p>
        )}
        {canManage ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {isOpen && nonVoterCount > 0 && (
              <button
                onClick={onRemind}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[12px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-60 dark:bg-violet-950/40 dark:text-violet-300"
                title="Notifier les non-votants"
              >
                <BellRing className="h-3.5 w-3.5" /> Relancer ({nonVoterCount})
              </button>
            )}
            {(p.voters || p.nonVoters) && (
              <button
                onClick={() => setShowDetail((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted/60"
              >
                <Users className="h-3.5 w-3.5" /> Détail
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetail && "rotate-180")} />
              </button>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={isOpen ? onClose : onReopen}
                disabled={busy}
                title={isOpen ? "Clôturer" : "Rouvrir"}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-muted/60 disabled:opacity-60"
              >
                {isOpen ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={onRemove}
                disabled={busy}
                title="Supprimer"
                className="rounded-md p-1.5 text-muted-foreground/70 hover:bg-muted/60 hover:text-red-600 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Détail votants / non-votants (manageur+) */}
        {canManage && showDetail && (
          <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
            {p.options.map((o) => (
              <div key={o} className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-[76px] text-[12px] font-medium text-muted-foreground">{o}</span>
                {(p.voters?.[o] ?? []).length === 0 ? (
                  <span className="text-[12px] text-muted-foreground/50">—</span>
                ) : (
                  (p.voters?.[o] ?? []).map((v) => <Chip key={v.id} person={v} />)
                )}
              </div>
            ))}
            {p.nonVoters && p.nonVoters.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-border/60 pt-2">
                <span className="min-w-[76px] text-[12px] font-medium text-muted-foreground/70">
                  N'ont pas voté
                </span>
                {p.nonVoters.map((v) => (
                  <Chip key={v.id} person={v} muted />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ person, muted }: { person: Person; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]",
        muted ? "border-dashed border-border bg-transparent text-muted-foreground" : "border-border bg-muted/40"
      )}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: person.color }} />
      {person.name}
    </span>
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

  const setOpt = (i: number, v: string) => setOptions((prev) => prev.map((o, k) => (k === i ? v : o)));
  const addOpt = () => options.length < 6 && setOptions((prev) => [...prev, ""]);
  const removeOpt = (i: number) => options.length > 2 && setOptions((prev) => prev.filter((_, k) => k !== i));

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
      if (!res.ok) toast({ tone: "error", title: "Création impossible", description: d.error ?? "Réessaie." });
      else {
        setQuestion("");
        setOptions(["Oui", "Non", "Peut-être"]);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4 dark:border-violet-900/40 dark:bg-violet-950/10">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
          Question
          <input
            type="text"
            value={question}
            maxLength={200}
            placeholder="Ex. Qui peut venir samedi matin ?"
            onChange={(e) => setQuestion(e.target.value)}
            className="rounded-lg border border-input bg-card px-3 py-2 text-[14px] text-foreground"
          />
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted-foreground">Choix</span>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  onClick={() => setOptions(pr.options)}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50"
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
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
