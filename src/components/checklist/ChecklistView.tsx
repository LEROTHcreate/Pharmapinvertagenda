"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Settings2,
  Sun,
  Moon,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import type { ChecklistMoment } from "@prisma/client";
import {
  MOMENT_LABELS,
  MOMENTS,
  type ChecklistItemDTO,
  type ChecklistCheckDTO,
} from "@/lib/checklist";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type CheckState = {
  done: boolean;
  note: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
};

const MOMENT_ICON: Record<ChecklistMoment, typeof Sun> = {
  OUVERTURE: Sun,
  FERMETURE: Moon,
};

export function ChecklistView({
  items,
  checks,
  date,
  today,
  canManage,
}: {
  items: ChecklistItemDTO[];
  checks: ChecklistCheckDTO[];
  date: string;
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // État local des coches (source de vérité pour la session) — remonté à chaque
  // date via key={date} dans la page.
  const [state, setState] = useState<Record<string, CheckState>>(() => {
    const m: Record<string, CheckState> = {};
    for (const c of checks) {
      m[c.itemId] = {
        done: c.done,
        note: c.note,
        checkedByName: c.checkedByName,
        checkedAt: c.checkedAt,
      };
    }
    return m;
  });
  const [manage, setManage] = useState(false);

  const isToday = date === today;

  const persist = useCallback(
    async (itemId: string, done: boolean, note: string | null) => {
      try {
        const res = await fetch("/api/checklist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId, date, done, note }),
        });
        if (!res.ok) throw new Error();
      } catch {
        toast({ tone: "error", title: "Échec de l'enregistrement" });
        router.refresh();
      }
    },
    [date, router, toast]
  );

  const toggle = useCallback(
    (item: ChecklistItemDTO, done: boolean) => {
      const note = state[item.id]?.note ?? null;
      setState((prev) => ({
        ...prev,
        [item.id]: {
          done,
          note,
          checkedByName: done ? "Vous" : null,
          checkedAt: done ? new Date().toISOString() : null,
        },
      }));
      void persist(item.id, done, note);
    },
    [state, persist]
  );

  const saveNote = useCallback(
    (item: ChecklistItemDTO, note: string) => {
      const trimmed = note.trim();
      const prev = state[item.id];
      // Saisir un relevé = valider l'élément.
      const done = trimmed !== "" ? true : prev?.done ?? false;
      setState((p) => ({
        ...p,
        [item.id]: {
          done,
          note: trimmed || null,
          checkedByName: done ? prev?.checkedByName ?? "Vous" : prev?.checkedByName ?? null,
          checkedAt: done ? prev?.checkedAt ?? new Date().toISOString() : prev?.checkedAt ?? null,
        },
      }));
      void persist(item.id, done, trimmed || null);
    },
    [state, persist]
  );

  function navDate(delta: number) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    router.push(`/checklist?date=${d.toISOString().slice(0, 10)}`);
  }

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* En-tête */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            <ClipboardCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Checklist
            </h1>
            <p className="text-sm capitalize text-muted-foreground">{dateLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navDate(-1)}
              aria-label="Jour précédent"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {!isToday && (
              <button
                onClick={() => router.push("/checklist")}
                className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium hover:bg-muted"
              >
                Aujourd&apos;hui
              </button>
            )}
            <button
              onClick={() => navDate(1)}
              disabled={isToday}
              aria-label="Jour suivant"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {canManage && (
            <button
              onClick={() => setManage((m) => !m)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                manage
                  ? "border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/30"
                  : "border-border hover:bg-muted"
              )}
            >
              <Settings2 className="h-4 w-4" />
              {manage ? "Terminé" : "Gérer"}
            </button>
          )}
        </div>
      </header>

      {!isToday && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[12.5px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          Vous consultez un jour passé (lecture / historique).
        </p>
      )}

      {/* Sections par moment */}
      {MOMENTS.map((moment) => {
        const list = items.filter((i) => i.moment === moment);
        const doneCount = list.filter((i) => state[i.id]?.done).length;
        const Icon = MOMENT_ICON[moment];
        const allDone = list.length > 0 && doneCount === list.length;
        return (
          <section
            key={moment}
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/40 px-4 py-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Icon className="h-4 w-4 text-violet-600" />
                {MOMENT_LABELS[moment]}
              </h2>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[12px] font-semibold tabular-nums",
                  allDone
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                )}
              >
                {doneCount}/{list.length} {allDone ? "✓" : ""}
              </span>
            </div>

            <ul className="divide-y divide-border/60">
              {list.length === 0 && (
                <li className="px-4 py-4 text-[13px] text-muted-foreground">
                  Aucun élément — {canManage ? "ajoutez-en ci-dessous." : "à configurer par un titulaire."}
                </li>
              )}
              {list.map((item) => {
                const st = state[item.id];
                const done = !!st?.done;
                return (
                  <li key={item.id} className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
                    <button
                      onClick={() => toggle(item, !done)}
                      disabled={!isToday}
                      aria-pressed={done}
                      aria-label={done ? "Décocher" : "Cocher"}
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all",
                        done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-zinc-300 bg-background hover:border-violet-400",
                        !isToday && "opacity-60"
                      )}
                    >
                      {done && <Check className="h-4 w-4" strokeWidth={3} />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-[14px] leading-snug",
                          done ? "text-muted-foreground line-through" : "text-foreground"
                        )}
                      >
                        {item.label}
                      </p>

                      {item.needsNote && (
                        <input
                          type="text"
                          defaultValue={st?.note ?? ""}
                          onBlur={(e) => {
                            if ((e.target.value.trim() || null) !== (st?.note ?? null)) {
                              saveNote(item, e.target.value);
                            }
                          }}
                          disabled={!isToday}
                          placeholder="Relevé (ex. 4,2 °C)"
                          className="mt-1 w-40 rounded-md border border-border bg-background px-2 py-1 text-[12.5px] disabled:opacity-60"
                        />
                      )}

                      {done && st?.checkedByName && (
                        <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                          ✓ {st.checkedByName}
                          {st.checkedAt
                            ? ` · ${new Date(st.checkedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </p>
                      )}
                    </div>

                    {manage && (
                      <button
                        onClick={() => deleteItem(item.id)}
                        disabled={isPending}
                        aria-label="Supprimer l'élément"
                        className="mt-0.5 rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {manage && <AddItemRow moment={moment} onAdded={() => startTransition(() => router.refresh())} />}
          </section>
        );
      })}
    </div>
  );

  function deleteItem(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/checklist/items?id=${id}`, { method: "DELETE" });
      if (!res.ok) toast({ tone: "error", title: "Suppression impossible" });
      router.refresh();
    });
  }
}

/** Ligne d'ajout d'un élément (mode gestion). */
function AddItemRow({
  moment,
  onAdded,
}: {
  moment: ChecklistMoment;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [needsNote, setNeedsNote] = useState(false);
  const [saving, setSaving] = useState(false);

  async function add() {
    const l = label.trim();
    if (!l) return;
    setSaving(true);
    try {
      const res = await fetch("/api/checklist/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: l, moment, needsNote }),
      });
      if (!res.ok) throw new Error();
      setLabel("");
      setNeedsNote(false);
      onAdded();
    } catch {
      toast({ tone: "error", title: "Ajout impossible" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border/70 bg-muted/20 px-3 py-2.5 sm:px-4">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Nouvel élément…"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]"
      />
      <label className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
        <input
          type="checkbox"
          checked={needsNote}
          onChange={(e) => setNeedsNote(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        relevé
      </label>
      <button
        onClick={add}
        disabled={saving || !label.trim()}
        className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Ajouter
      </button>
    </div>
  );
}
