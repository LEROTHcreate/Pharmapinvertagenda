"use client";

import { useEffect, useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarHeart,
  FlaskConical,
  GraduationCap,
  Handshake,
  Loader2,
  MapPin,
  MessagesSquare,
  PartyPopper,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UtensilsCrossed,
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

type IconType = ComponentType<{ className?: string }>;

/** Ambiance visuelle par type : icône, couleurs, animation, confettis. */
const TYPE_CONFIG: Record<
  TeamEventType,
  {
    label: string;
    Icon: IconType;
    card: string; // dégradé de fond de carte
    ring: string; // liseré / accent
    chip: string; // badge de type (fond + texte)
    anim: string; // animation discrète de l'icône
    glow: string; // lueur "jour J" (rgba)
    confetti: string[]; // couleurs des confettis "jour J"
  }
> = {
  REPAS: {
    label: "Repas d'équipe",
    Icon: UtensilsCrossed,
    card: "from-amber-50 to-orange-100/70 dark:from-amber-950/30 dark:to-orange-950/20",
    ring: "ring-amber-200/70 dark:ring-amber-900/50",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    anim: "tev-bob",
    glow: "rgba(245,158,11,0.55)",
    confetti: ["#f59e0b", "#fb923c", "#fbbf24", "#fde68a"],
  },
  ANIMATION_LABO: {
    label: "Animation labo",
    Icon: FlaskConical,
    card: "from-violet-50 to-fuchsia-100/70 dark:from-violet-950/30 dark:to-fuchsia-950/20",
    ring: "ring-violet-200/70 dark:ring-violet-900/50",
    chip: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
    anim: "tev-sparkle",
    glow: "rgba(168,85,247,0.55)",
    confetti: ["#a855f7", "#d946ef", "#c084fc", "#f0abfc"],
  },
  REUNION_FOURNISSEUR: {
    label: "Réunion fournisseur",
    Icon: Handshake,
    card: "from-sky-50 to-blue-100/70 dark:from-sky-950/30 dark:to-blue-950/20",
    ring: "ring-sky-200/70 dark:ring-sky-900/50",
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    anim: "tev-bob",
    glow: "rgba(14,165,233,0.5)",
    confetti: ["#0ea5e9", "#38bdf8", "#60a5fa", "#7dd3fc"],
  },
  ENTRETIEN: {
    label: "Entretien",
    Icon: MessagesSquare,
    card: "from-emerald-50 to-teal-100/70 dark:from-emerald-950/30 dark:to-teal-950/20",
    ring: "ring-emerald-200/70 dark:ring-emerald-900/50",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    anim: "tev-pulse",
    glow: "rgba(16,185,129,0.5)",
    confetti: ["#10b981", "#14b8a6", "#34d399", "#5eead4"],
  },
  FORMATION: {
    label: "Formation",
    Icon: GraduationCap,
    card: "from-indigo-50 to-blue-100/70 dark:from-indigo-950/30 dark:to-blue-950/20",
    ring: "ring-indigo-200/70 dark:ring-indigo-900/50",
    chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
    anim: "tev-bob",
    glow: "rgba(99,102,241,0.5)",
    confetti: ["#6366f1", "#818cf8", "#60a5fa", "#a5b4fc"],
  },
  AUTRE: {
    label: "Événement",
    Icon: PartyPopper,
    card: "from-rose-50 to-pink-100/70 dark:from-rose-950/30 dark:to-pink-950/20",
    ring: "ring-rose-200/70 dark:ring-rose-900/50",
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    anim: "tev-wiggle",
    glow: "rgba(244,63,94,0.55)",
    confetti: ["#f43f5e", "#ec4899", "#fb7185", "#fbbf24"],
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

  // Événements du JOUR → déclenche la fête (confettis + bandeau).
  const todayEvents = events.filter((e) => daysUntil(e.date) <= 0);
  const confettiColors = Array.from(
    new Set(todayEvents.flatMap((e) => TYPE_CONFIG[e.type].confetti))
  );

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
      {/* Confettis le jour d'un événement */}
      {todayEvents.length > 0 && <Confetti colors={confettiColors} />}

      {/* Bandeau festif « c'est le jour ! » */}
      {todayEvents.length > 0 && (
        <div className="tev-today-banner relative z-[1] mb-3 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-200 via-rose-200 to-violet-200 px-3 py-2 text-center text-[12.5px] font-semibold text-foreground shadow-sm dark:from-amber-500/30 dark:via-rose-500/30 dark:to-violet-500/30">
          <PartyPopper className="h-4 w-4 shrink-0 tev-bob" />
          {todayEvents.length === 1
            ? `Aujourd'hui : ${todayEvents[0].title} !`
            : `${todayEvents.length} événements aujourd'hui !`}
        </div>
      )}

      {/* En-tête */}
      <div className="relative z-[1] mb-3 flex items-start justify-between gap-2">
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
        <ul className="relative z-[1] space-y-3">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              ev={ev}
              canManage={canManage}
              deleting={deleting === ev.id}
              isToday={daysUntil(ev.date) <= 0}
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

/* ─── Carte événement ────────────────────────────────────────────── */

function EventCard({
  ev,
  canManage,
  deleting,
  isToday,
  onEdit,
  onDelete,
}: {
  ev: TeamEventRow;
  canManage: boolean;
  deleting: boolean;
  isToday: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = TYPE_CONFIG[ev.type];
  const Icon = cfg.Icon;
  const d = new Date(`${ev.date}T00:00:00`);
  const soon = daysUntil(ev.date) <= 2;

  return (
    <li
      className={cn(
        "group/ev relative overflow-hidden rounded-2xl bg-gradient-to-br p-3 transition-transform duration-200 hover:-translate-y-0.5",
        cfg.card,
        isToday ? "tev-today-card ring-2" : "ring-1",
        cfg.ring
      )}
      style={isToday ? ({ ["--glow"]: cfg.glow } as React.CSSProperties) : undefined}
    >
      {/* Ruban « aujourd'hui » */}
      {isToday && (
        <div className="absolute right-0 top-0 z-10 flex items-center gap-0.5 rounded-bl-lg bg-white/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-foreground shadow-sm dark:bg-black/40">
          <PartyPopper className="h-2.5 w-2.5 tev-wiggle" /> Aujourd&apos;hui
        </div>
      )}

      {/* Reflet doux qui balaie la carte au survol */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover/ev:translate-x-full dark:via-white/10"
      />

      <div className="relative flex items-start gap-3">
        {/* Pastille date + icône du type */}
        <div className="flex flex-col items-center gap-1.5">
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
          <div
            className={cn(
              "flex items-center justify-center rounded-lg",
              isToday ? "h-9 w-9" : "h-8 w-8",
              cfg.chip,
              cfg.anim
            )}
          >
            <Icon className={isToday ? "h-5 w-5" : "h-4 w-4"} />
          </div>
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

/* ─── Confettis (le jour d'un événement) ─────────────────────────── */

type Piece = {
  left: number;
  delay: number;
  dur: number;
  color: string;
  size: number;
  round: boolean;
  drift: number;
};

function Confetti({ colors }: { colors: string[] }) {
  // Généré côté client (après montage) → pas d'écart d'hydratation dû au hasard.
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    if (colors.length === 0) {
      setPieces([]);
      return;
    }
    const arr: Piece[] = Array.from({ length: 34 }, (_, i) => ({
      left: Math.round(Math.random() * 100),
      delay: Math.round(Math.random() * 5000) / 1000,
      dur: 3 + Math.round(Math.random() * 3000) / 1000,
      color: colors[i % colors.length],
      size: 5 + Math.round(Math.random() * 5),
      round: Math.random() > 0.55,
      drift: Math.round((Math.random() * 2 - 1) * 30),
    }));
    setPieces(arr);
  }, [colors]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn(
            "tev-confetti absolute top-0 block",
            p.round ? "rounded-full" : "rounded-[1px]"
          )}
          style={
            {
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.round ? p.size : Math.round(p.size * 0.5)}px`,
              backgroundColor: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              ["--drift"]: `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function EmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="relative z-[1] flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/40 px-4 py-8 text-center">
      <CalendarHeart className="h-8 w-8 text-violet-400 tev-bob" />
      <p className="mt-2 text-[13px] font-medium">Rien de prévu pour l&apos;instant</p>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        {canManage
          ? "Ajoute un repas d'équipe ou une animation pour faire vivre l'officine."
          : "Les prochains repas et animations apparaîtront ici."}
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
          {/* Type — grille de pastilles avec icônes */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {TEAM_EVENT_TYPES.map((t) => {
                const cfg = TYPE_CONFIG[t];
                const Icon = cfg.Icon;
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
                    <Icon className="h-4 w-4 shrink-0" />
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
