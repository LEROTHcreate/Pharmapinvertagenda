"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Copy,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { WeekType } from "@prisma/client";
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

export type GabaritRow = {
  id: string;
  name: string;
  weekType: WeekType;
  entryCount: number;
  updatedAt: string;
};

const TYPES: WeekType[] = ["S1", "S2"];

export function GabaritsList({ rows }: { rows: GabaritRow[] }) {
  const router = useRouter();
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<GabaritRow | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<GabaritRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<WeekType, GabaritRow[]>();
    TYPES.forEach((t) => map.set(t, []));
    rows.forEach((r) => map.get(r.weekType)!.push(r));
    return map;
  }, [rows]);

  async function deleteTemplate(target: GabaritRow) {
    setError(null);
    setBusyDelete(target.id);
    try {
      const res = await fetch(`/api/templates/${target.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de la suppression");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyDelete(null);
      setConfirmTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </div>
      )}

      {TYPES.map((type) => {
        const list = grouped.get(type) ?? [];
        return (
          <section key={type}>
            <header className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-violet-600" />
                <h2 className="text-base font-semibold tracking-tight">
                  Semaine {type}
                </h2>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                  {list.length} gabarit{list.length > 1 ? "s" : ""}
                </span>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/gabarits/new/${type}`}>
                  <Plus className="h-4 w-4" />
                  Nouveau {type}
                </Link>
              </Button>
            </header>

            {list.length === 0 ? (
              <EmptyState type={type} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((g) => (
                  <GabaritCard
                    key={g.id}
                    row={g}
                    onDelete={() => setConfirmTarget(g)}
                    onDuplicate={() => setDuplicateTarget(g)}
                    busyDelete={busyDelete === g.id}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Dialog duplication */}
      <DuplicateDialog
        target={duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        onSuccess={(newId) => {
          setDuplicateTarget(null);
          // Navigate to the new template's edit page so user can immediately
          // tweak it without searching for it in the list.
          router.push(`/gabarits/${newId}/edit`);
        }}
      />

      {/* Confirmation suppression */}
      <Dialog
        open={!!confirmTarget}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              Supprimer « {confirmTarget?.name} » ?
            </DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Les semaines déjà appliquées avec
              ce gabarit ne sont pas modifiées.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Annuler
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmTarget && deleteTemplate(confirmTarget)}
              disabled={busyDelete !== null}
            >
              {busyDelete === confirmTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GabaritCard({
  row,
  onDelete,
  onDuplicate,
  busyDelete,
}: {
  row: GabaritRow;
  onDelete: () => void;
  onDuplicate: () => void;
  busyDelete: boolean;
}) {
  return (
    <div className="hover-lift rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-700">
          <LayoutTemplate className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium tracking-tight text-zinc-900">
            {row.name}
          </p>
          <p className="text-[11px] text-zinc-500">
            {row.entryCount} créneau{row.entryCount > 1 ? "x" : ""} ·{" "}
            modifié le {formatDate(row.updatedAt)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onDuplicate}
          disabled={busyDelete}
          className="text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          title="Dupliquer ce gabarit (pour tester une variante)"
        >
          <Copy className="h-4 w-4" />
          Dupliquer
        </Button>
        <Button
          asChild
          size="sm"
          variant="outline"
          className={cn(busyDelete && "opacity-60")}
        >
          <Link href={`/gabarits/${row.id}/edit`}>
            <Pencil className="h-4 w-4" />
            Éditer
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={busyDelete}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {busyDelete ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Dialog de duplication de gabarit.
 * - Pré-remplit le nom avec "Copie de <source>"
 * - Permet de basculer S1↔S2 (utile pour partir d'un S1 et faire son S2)
 * - Sur succès, navigue vers la page d'édition du nouveau gabarit
 */
function DuplicateDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: GabaritRow | null;
  onClose: () => void;
  onSuccess: (newId: string) => void;
}) {
  const [name, setName] = useState("");
  const [weekType, setWeekType] = useState<WeekType>("S1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset à chaque ouverture avec une cible fraîche
  useEffect(() => {
    if (target) {
      setName(`Copie de ${target.name}`);
      setWeekType(target.weekType);
      setError(null);
    }
  }, [target]);

  async function handleDuplicate() {
    if (!target) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Le nom est obligatoire");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${target.id}/duplicate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          newName: trimmed,
          targetWeekType: weekType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la duplication");
        return;
      }
      onSuccess(data.id);
    } catch {
      setError("Réseau indisponible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Dupliquer « {target?.name} »</DialogTitle>
          <DialogDescription>
            Crée une copie modifiable. L&apos;original reste intact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nom du nouveau gabarit */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-zinc-700">
              Nom de la copie
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              placeholder="Nom du gabarit"
            />
          </div>

          {/* Type S1 / S2 */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Type de semaine
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["S1", "S2"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWeekType(t)}
                  disabled={busy}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                    weekType === t
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  Semaine {t}
                  {target?.weekType === t && (
                    <span className="ml-1 text-[10px] text-zinc-400">
                      (source)
                    </span>
                  )}
                </button>
              ))}
            </div>
            {target && weekType !== target.weekType && (
              <p className="mt-2 text-[11px] text-violet-700/80">
                💡 La copie sera enregistrée comme {weekType} (basculée
                depuis {target.weekType}).
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700 ring-1 ring-inset ring-red-100">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={handleDuplicate} disabled={busy || !name.trim()}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Dupliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ type }: { type: WeekType }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-6 py-8">
      <div className="flex flex-col items-center text-center">
        <p className="text-sm text-zinc-500">
          Aucun gabarit {type} pour le moment.
        </p>
        <p className="mt-1 text-[11px] text-zinc-400">
          Cliquez « Nouveau {type} » pour en créer un.
        </p>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
