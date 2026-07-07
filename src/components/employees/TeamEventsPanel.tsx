"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarHeart,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEAM_EVENT_TYPES, type TeamEventType } from "@/validators/team-event";
import {
  createTeamEvent,
  updateTeamEvent,
  deleteTeamEvent,
} from "@/app/(dashboard)/employes/team-events-actions";

export type TeamEventRow = {
  id: string;
  title: string;
  description: string | null;
  date: string; // ISO "YYYY-MM-DD"
  time: string | null; // "HH:MM"
  type: TeamEventType;
  location: string | null;
};

/** Ambiance visuelle par type : emoji, couleurs, animation de l'icône. */
const TYPE_CONFIG: Record<
  TeamEventType,
  {
    label: string;
    emoji: string;
    card: string; // dégradé de fond de carte
    ring: string; // liseré / accent
    chip: string; // pastille de type
    anim: string; // classe d'animation de l'emoji
  }
> = {
  REPAS: {
    label: "Repas d'équipe",
    emoji: "🍽️",
    card: "from-amber-50 to-orange-100/70 dark:from-amber-950/30 dark:to-orange-950/20",
    ring: "ring-amber-200/70 dark:ring-amber-900/50",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    anim: "tev-bob",
  },
  ANIMATION_LABO: {
    label: "Animation labo",
    emoji: "🧪",
    card: "from-violet-50 to-fuchsia-100/70 dark:from-violet-950/30 dark:to-fuchsia-950/20",
    ring: "ring-violet-200/70 dark:ring-violet-900/50",
    chip: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
    anim: "tev-sparkle",
  },
  REUNION_FOURNISSEUR: {
    label: "Réunion fournisseur",
    emoji: "🤝",
    card: "from-sky-50 to-blue-100/70 dark:from-sky-950/30 dark:to-blue-950/20",
    ring: "ring-sky-200/70 dark:ring-sky-900/50",
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    anim: "tev-bob",
  },
  ENTRETIEN: {
    label: "Entretien",
    emoji: "💬",
    card: "from-emerald-50 to-teal-100/70 dark:from-emerald-950/30 dark:to-teal-950/20",
    ring: "ring-emerald-200/70 dark:ring-emerald-900/50",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    anim: "tev-pulse",
  },
  FORMATION: {
    label: "Formation",
    emoji: "🎓",
    card: "from-indigo-50 to-blue-100/70 dark:from-indigo-950/30 dark:to-blue-950/20",
    ring: "ring-indigo-200/70 dark:ring-indigo-900/50",
    chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
    anim: "tev-bob",
  },
  AUTRE: {
    label: "Événement",
    emoji: "🎉",
    card: "from-rose-50 to-pink-100/70 dark:from-rose-950/30 dark:to-pink-950/20",
    ring: "ring-rose-200/70 dark:ring-rose-900/50",
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    anim: "tev-wiggle",
  },
};

const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MONTHS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** Nombre de jours entre aujourd'hui (minuit local) et la date ISO donnée. */
function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function countdownLabel(iso: string): string {
  const n = daysUntil(iso);
  if (n <= 0) return "Aujourd'hui";
  if (n === 1) return "Demain";
  if (n < 7) return `Dans ${n} jours`;
  if (n < 14) return "La semaine prochaine";
  if (n < 31) return `Dans ${Math.round(n / 7)} sem.`;
  return `Dans ${Math.round(n / 30)} mois`;
}

export function TeamEventsPanel({
  events,
  canManage,
}: {
  events: TeamEventRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamEventRow | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteTeamEvent(id);
      startTransition(() => router.refresh());
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
      {/* En-tête festif */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
            <Sparkles className="h-4 w-4 text-violet-500 tev-sparkle" />
            La vie de l&apos;équipe
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Repas, animations labo, rendez-vous… les prochains moments à partager.
          </p>
        </div>
        {canManage && (
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        )}
      </div>

      {events.length === 0 ? (
        <EmptyState canManage={canManage} />
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              ev={ev}
              canManage={canManage}
              deleting={deleting === ev.id}
              onEdit={() => {
                setEditTarget(ev);
                setFormOpen(true);
              }}
              onDelete={() => handleDelete(ev.id)}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <EventFormDialog
          open={formOpen}
          target={editTarget}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </section>
  );
}

/* ─── Carte événement animée ─────────────────────────────────────── */

function EventCard({
  ev,
  canManage,
  deleting,
  onEdit,
  onDelete,
}: {
  ev: TeamEventRow;
  canManage: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = TYPE_CONFIG[ev.type];
  const d = new Date(`${ev.date}T00:00:00`);
  const soon = daysUntil(ev.date) <= 2;

  return (
    <li
      className={cn(
        "group/ev relative overflow-hidden rounded-2xl bg-gradient-to-br p-3 ring-1 transition-transform duration-200 hover:-translate-y-0.5",
        cfg.card,
        cfg.ring
      )}
    >
      {/* Reflet doux qui balaie la carte au survol */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover/ev:translate-x-full dark:via-white/10"
      />

      <div className="relative flex items-start gap-3">
        {/* Pastille date + emoji animé */}
        <div className="flex flex-col items-center">
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-white/70 shadow-sm ring-1 ring-black/5 dark:bg-black/20">
            <span className="text-[10px] font-medium uppercase leading-none text-muted-foreground">
              {WEEKDAYS[d.getDay()]}
            </span>
            <span className="font-mono text-[20px] font-bold leading-tight tabular-nums text-foreground">
              {d.getDate()}
            </span>
            <span className="text-[9px] font-medium leading-none text-muted-foreground">
              {MONTHS[d.getMonth()]}
            </span>
          </div>
          <span className={cn("mt-1 text-[22px] leading-none", cfg.anim)}>
            {cfg.emoji}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                cfg.chip
              )}
            >
              {cfg.label}
            </span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                soon
                  ? "bg-violet-600 text-white tev-pulse"
                  : "bg-white/70 text-foreground/70 dark:bg-black/25"
              )}
            >
              {countdownLabel(ev.date)}
            </span>
          </div>

          <p className="mt-1 text-[14px] font-semibold leading-snug tracking-tight text-foreground">
            {ev.title}
          </p>

          {ev.description && (
            <p className="mt-0.5 text-[12px] leading-snug text-foreground/70">
              {ev.description}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-foreground/60">
            {ev.time && (
              <span className="font-mono tabular-nums">{ev.time}</span>
            )}
            {ev.location && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {ev.location}
              </span>
            )}
          </div>
        </div>

        {/* Actions manager (au survol) */}
        {canManage && (
          <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover/ev:opacity-100">
            <button
              type="button"
              onClick={onEdit}
              disabled={deleting}
              title="Modifier"
              aria-label="Modifier"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-foreground/60 hover:bg-white/60 hover:text-foreground dark:hover:bg-black/30"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              title="Supprimer"
              aria-label="Supprimer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function EmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/40 px-4 py-8 text-center">
      <CalendarHeart className="h-8 w-8 text-violet-400 tev-bob" />
      <p className="mt-2 text-[13px] font-medium">Rien de prévu pour l&apos;instant</p>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        {canManage
          ? "Ajoute un repas d'équipe ou une animation pour animer la vie de l'officine 🌱"
          : "Les prochains repas et animations apparaîtront ici 🌱"}
      </p>
    </div>
  );
}

/* ─── Formulaire ajout / édition ─────────────────────────────────── */

function EventFormDialog({
  open,
  target,
  onClose,
  onSaved,
}: {
  open: boolean;
  target: TeamEventRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TeamEventType>("REPAS");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Ré)initialise le formulaire à chaque ouverture selon la cible.
  useEffect(() => {
    if (!open) return;
    setType(target?.type ?? "REPAS");
    setTitle(target?.title ?? "");
    setDate(target?.date ?? "");
    setTime(target?.time ?? "");
    setLocation(target?.location ?? "");
    setDescription(target?.description ?? "");
    setError(null);
  }, [open, target]);

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Le titre est obligatoire");
      return;
    }
    if (!date) {
      setError("La date est obligatoire");
      return;
    }
    setBusy(true);
    setError(null);
    const input = {
      title: title.trim(),
      description: description.trim() || null,
      date,
      time: time || null,
      type,
      location: location.trim() || null,
    };
    try {
      const res = target
        ? await updateTeamEvent(target.id, input)
        : await createTeamEvent(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved();
    } catch {
      setError("Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target ? "Modifier l'événement" : "Nouvel événement d'équipe"}
          </DialogTitle>
          <DialogDescription>
            Repas, animation labo, réunion fournisseur, entretien… donne envie à
            l&apos;équipe d&apos;y participer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Type — grille de pastilles */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {TEAM_EVENT_TYPES.map((t) => {
                const cfg = TYPE_CONFIG[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    disabled={busy}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      active
                        ? "border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                        : "border-border bg-card text-foreground/80 hover:bg-muted/40"
                    )}
                  >
                    <span className="text-[15px] leading-none">{cfg.emoji}</span>
                    <span className="truncate">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Titre */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Titre
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              maxLength={100}
              autoFocus
              placeholder="Ex : Repas de fin de trimestre"
              className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {/* Date + heure */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <div className="w-[110px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Heure <span className="normal-case text-muted-foreground/60">(opt.)</span>
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          {/* Lieu */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lieu <span className="normal-case text-muted-foreground/60">(optionnel)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={busy}
              maxLength={120}
              placeholder="Ex : Restaurant Le Comptoir"
              className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description <span className="normal-case text-muted-foreground/60">(optionnel)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              maxLength={500}
              rows={2}
              placeholder="Quelques mots pour donner envie…"
              className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700 ring-1 ring-inset ring-red-100">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            <X className="h-4 w-4" />
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {target ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
