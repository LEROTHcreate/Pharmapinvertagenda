"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Check, Trash2, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AvatarImage } from "@/components/layout/AvatarImage";
import { cn } from "@/lib/utils";

type PayrollNoteDTO = {
  id: string;
  date: string; // YYYY-MM-DD
  infos: string;
  motif: string | null;
  accountingNote: string | null;
  status: "PENDING" | "ACCOUNTED";
  accountedAt: string | null;
  accountedById: string | null;
  createdAt: string;
  author: {
    id: string;
    name: string;
    avatarId: string | null;
    firstName: string | null;
    displayColor: string | null;
  };
};

type Props = {
  currentUser: {
    id: string;
    role: "ADMIN" | "EMPLOYEE";
  };
};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PayrollNotesView({ currentUser }: Props) {
  const isAdmin = currentUser.role === "ADMIN";
  const [notes, setNotes] = useState<PayrollNoteDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dialogue de création
  const [formOpen, setFormOpen] = useState(false);

  // Dialogue admin "comptabiliser" — saisie de l'accountingNote
  const [accountTarget, setAccountTarget] = useState<PayrollNoteDTO | null>(null);
  const [accountNoteDraft, setAccountNoteDraft] = useState("");

  // Confirmation de suppression
  const [deleteTarget, setDeleteTarget] = useState<PayrollNoteDTO | null>(null);

  async function refetch() {
    try {
      const res = await fetch("/api/payroll-notes");
      if (!res.ok) return;
      const data = (await res.json()) as { notes: PayrollNoteDTO[] };
      setNotes(data.notes);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refetch();
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/payroll-notes/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur");
        return false;
      }
      await refetch();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function deleteNote(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/payroll-notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur");
        return;
      }
      await refetch();
    } finally {
      setBusy(null);
      setDeleteTarget(null);
    }
  }

  // Tri : PENDING en premier, puis ACCOUNTED, chacun par date desc.
  // L'admin voit immédiatement ce qui reste à comptabiliser en haut.
  const sorted = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "PENDING" ? -1 : 1;
      }
      return b.date.localeCompare(a.date);
    });
  }, [notes]);

  const pendingCount = notes.filter((n) => n.status === "PENDING").length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Notes</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 text-[12px] font-medium text-amber-800 dark:text-amber-200">
              <span className="font-semibold tabular-nums">{pendingCount}</span>
              à comptabiliser
            </span>
          )}
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle note
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground text-sm">
          Aucune note pour le moment.
          <p className="mt-2 text-xs">
            Cliquez sur « Nouvelle note » pour ajouter une régul.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-24">Date</th>
                <th className="px-3 py-2 text-left font-medium">Auteur</th>
                <th className="px-3 py-2 text-left font-medium">Infos</th>
                <th className="px-3 py-2 text-left font-medium">Motif</th>
                <th className="px-3 py-2 text-left font-medium">À comptabiliser</th>
                <th className="px-3 py-2 text-center font-medium w-32">Statut</th>
                <th className="px-3 py-2 text-right font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((n) => {
                const isOwner = n.author.id === currentUser.id;
                const rowBusy = busy === n.id;
                const isPending = n.status === "PENDING";
                return (
                  <tr
                    key={n.id}
                    className={cn(
                      "border-t transition-colors align-top",
                      isPending && "bg-amber-50/30 dark:bg-amber-950/15"
                    )}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                      {formatDate(n.date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <AvatarImage
                          avatarId={n.author.avatarId}
                          firstName={
                            n.author.firstName ??
                            n.author.name.split(/\s+/).pop() ??
                            "?"
                          }
                          color={n.author.displayColor}
                          size={26}
                        />
                        <span className="text-[12.5px] font-medium truncate">
                          {n.author.firstName ?? n.author.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[320px]">
                      <p className="text-[13px] whitespace-pre-wrap break-words">
                        {n.infos}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      {n.motif ? (
                        <p className="text-[12.5px] text-muted-foreground italic break-words">
                          {n.motif}
                        </p>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      {n.accountingNote ? (
                        <p className="text-[12.5px] text-emerald-700 dark:text-emerald-300 break-words">
                          {n.accountingNote}
                        </p>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                          À comptabiliser
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                          <Check className="h-3 w-3" />
                          Comptabilisé
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => {
                              setAccountTarget(n);
                              setAccountNoteDraft(n.accountingNote ?? "");
                            }}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                            title={
                              isPending
                                ? "Marquer comptabilisé"
                                : "Modifier la note de comptabilisation"
                            }
                          >
                            {isPending ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Pencil className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        {isAdmin && !isPending && (
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() =>
                              patch(n.id, { markAccounted: false })
                            }
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
                            title="Annuler la comptabilisation"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                        {(isAdmin || (isOwner && isPending)) && (
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => setDeleteTarget(n)}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {rowBusy && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogue de création */}
      <NewNoteDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={refetch}
      />

      {/* Dialogue admin "comptabiliser" — saisie de la note de comptabilisation */}
      <Dialog
        open={accountTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAccountTarget(null);
            setAccountNoteDraft("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {accountTarget?.status === "PENDING"
                ? "Marquer comptabilisé"
                : "Modifier la note de comptabilisation"}
            </DialogTitle>
            <DialogDescription>
              Note libre pour tracer ce qui a été fait — ex. « OK déduit sur 12/24 »
              ou « Reporté en janvier ».
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            {accountTarget && (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-[12.5px]">
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDate(accountTarget.date)} ·{" "}
                  {accountTarget.author.firstName ?? accountTarget.author.name}
                </p>
                <p className="mt-1 text-foreground">{accountTarget.infos}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="acc-note">Note de comptabilisation</Label>
              <textarea
                id="acc-note"
                value={accountNoteDraft}
                onChange={(e) => setAccountNoteDraft(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ex: OK déduit sur 12/24"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setAccountTarget(null);
                setAccountNoteDraft("");
              }}
              disabled={busy === accountTarget?.id}
            >
              Annuler
            </Button>
            <Button
              onClick={async () => {
                if (!accountTarget) return;
                const ok = await patch(accountTarget.id, {
                  markAccounted: true,
                  accountingNote: accountNoteDraft || null,
                });
                if (ok) {
                  setAccountTarget(null);
                  setAccountNoteDraft("");
                }
              }}
              disabled={busy === accountTarget?.id}
            >
              {busy === accountTarget?.id && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {accountTarget?.status === "PENDING"
                ? "Comptabiliser"
                : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer cette note ?"
        description={
          deleteTarget
            ? `${formatDate(deleteTarget.date)} · ${deleteTarget.author.firstName ?? deleteTarget.author.name} : ${deleteTarget.infos}`
            : ""
        }
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) deleteNote(deleteTarget.id);
        }}
      />
    </div>
  );
}

/* ─── Dialogue de création ─────────────────────────────────────────── */

function NewNoteDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [infos, setInfos] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDate(todayIso());
    setInfos("");
    setMotif("");
    setError(null);
  }

  async function submit() {
    if (!infos.trim()) {
      setError("Le texte ne peut pas être vide");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          infos: infos.trim(),
          motif: motif.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur lors de l'envoi");
        return;
      }
      onCreated();
      onClose();
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle note</DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="note-date">Date concernée</Label>
            <Input
              id="note-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-infos">Note</Label>
            <textarea
              id="note-infos"
              value={infos}
              onChange={(e) => setInfos(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ex: 1h de retard ce matin"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 resize-none"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-motif">Motif (optionnel)</Label>
            <textarea
              id="note-motif"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ex: problème garde des enfants, rdv médical…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              reset();
            }}
            disabled={busy}
          >
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
