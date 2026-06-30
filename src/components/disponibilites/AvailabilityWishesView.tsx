"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Loader2, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type WishKind = "UNAVAILABLE" | "PREFER_OFF" | "PREFER_WORK";

type MyWish = { id: string; date: string; kind: WishKind; note: string | null };
type TeamWish = MyWish & { employeeId: string; employeeName: string };

const KIND_LABELS: Record<WishKind, string> = {
  UNAVAILABLE: "Indisponible",
  PREFER_OFF: "Préfère ne pas travailler",
  PREFER_WORK: "Souhaite travailler",
};

const KIND_STYLES: Record<WishKind, string> = {
  UNAVAILABLE: "bg-red-100 text-red-700",
  PREFER_OFF: "bg-amber-100 text-amber-700",
  PREFER_WORK: "bg-emerald-100 text-emerald-700",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function AvailabilityWishesView({
  isAdmin,
  hasEmployee,
}: {
  isAdmin: boolean;
  hasEmployee: boolean;
}) {
  const { toast } = useToast();
  const [mine, setMine] = useState<MyWish[]>([]);
  const [team, setTeam] = useState<TeamWish[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState("");
  const [kind, setKind] = useState<WishKind>("UNAVAILABLE");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const reqs: Promise<Response>[] = [];
      if (hasEmployee) reqs.push(fetch("/api/availability-wishes?scope=mine"));
      if (isAdmin) reqs.push(fetch("/api/availability-wishes?scope=all"));
      const res = await Promise.all(reqs);
      let idx = 0;
      if (hasEmployee) {
        const d = await res[idx++].json().catch(() => ({ wishes: [] }));
        setMine(d.wishes ?? []);
      }
      if (isAdmin) {
        const d = await res[idx++].json().catch(() => ({ wishes: [] }));
        setTeam(d.wishes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [hasEmployee, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      toast({ tone: "error", title: "Date manquante", description: "Choisis une date." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/availability-wishes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, kind, note: note.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ tone: "error", title: "Échec", description: d.error ?? "Erreur" });
        return;
      }
      setNote("");
      toast({ tone: "success", title: "Souhait enregistré", duration: 1800 });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/availability-wishes?date=${d}`, { method: "DELETE" });
      if (!res.ok) {
        toast({ tone: "error", title: "Suppression impossible" });
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Saisie + mes souhaits (si compte lié à une fiche) */}
      {hasEmployee ? (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <label className="text-[11.5px] text-zinc-500">Jour</label>
              <input
                type="date"
                min={todayIso()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block rounded-md border border-zinc-300 px-2.5 py-1.5 text-[13px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11.5px] text-zinc-500">Souhait</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as WishKind)}
                className="block rounded-md border border-zinc-300 px-2.5 py-1.5 text-[13px]"
              >
                {(Object.keys(KIND_LABELS) as WishKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-[11.5px] text-zinc-500">Note (option)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="ex : rendez-vous médical"
                className="block w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-[13px]"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Ajouter
            </button>
          </form>

          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
              Mes souhaits à venir
            </h2>
            {loading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : mine.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-2">
                Aucun souhait enregistré.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {mine.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 py-2">
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        KIND_STYLES[w.kind]
                      )}
                    >
                      {KIND_LABELS[w.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] capitalize text-zinc-900 dark:text-zinc-100">
                        {formatDate(w.date)}
                      </p>
                      {w.note && (
                        <p className="text-[11.5px] text-muted-foreground truncate">{w.note}</p>
                      )}
                    </div>
                    <button
                      onClick={() => remove(w.date)}
                      disabled={busy}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
          Votre compte n&apos;est pas lié à une fiche collaborateur — vous pouvez
          consulter les souhaits de l&apos;équipe mais pas en poser.
        </div>
      )}

      {/* Vue équipe (admin) */}
      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Users className="h-4 w-4 text-violet-600" />
            <h2 className="text-[13px] font-semibold text-zinc-800">
              Souhaits de l&apos;équipe
            </h2>
            <span className="text-[12px] text-muted-foreground">· {team.length}</span>
          </div>
          {loading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : team.length === 0 ? (
            <p className="text-[13px] text-muted-foreground px-4 py-3">
              Aucun souhait posé par l&apos;équipe pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {team.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      KIND_STYLES[w.kind]
                    )}
                  >
                    {KIND_LABELS[w.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                      {w.employeeName}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground capitalize">
                      {formatDate(w.date)}
                      {w.note ? ` · ${w.note}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
