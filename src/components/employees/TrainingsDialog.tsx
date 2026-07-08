"use client";

import * as React from "react";
import {
  GraduationCap,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { TrainingType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listTrainings,
  createTraining,
  deleteTraining,
  type TrainingDTO,
} from "@/app/(dashboard)/employes/training-actions";

const TYPE_LABELS: Record<TrainingType, string> = {
  DPC: "DPC",
  OBLIGATOIRE: "Obligatoire",
  INTERNE: "Interne",
  EXTERNE: "Externe",
  AUTRE: "Autre",
};

const TYPE_ORDER: TrainingType[] = [
  "DPC",
  "OBLIGATOIRE",
  "INTERNE",
  "EXTERNE",
  "AUTRE",
];

/** "2026-07-31" → "31/07/2026". */
function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Aujourd'hui au format ISO YYYY-MM-DD (valeur par défaut du champ date). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Modal de suivi des formations / DPC d'un collaborateur.
 * Liste les formations, permet d'en ajouter (intitulé, type, date, organisme,
 * lien d'attestation) et d'en supprimer. Le suivi DPC (rappel triennal) est
 * recalé automatiquement côté serveur via `dpcLastDate`.
 */
export function TrainingsDialog({
  employeeId,
  employeeName,
  open,
  onOpenChange,
  onChanged,
}: {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé après création/suppression (pour rafraîchir la table). */
  onChanged?: () => void;
}) {
  const [rows, setRows] = React.useState<TrainingDTO[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Formulaire d'ajout
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<TrainingType>("EXTERNE");
  const [date, setDate] = React.useState(todayIso());
  const [provider, setProvider] = React.useState("");
  const [url, setUrl] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listTrainings(employeeId);
    if (res.ok) setRows(res.data);
    else setError(res.error);
    setLoading(false);
  }, [employeeId]);

  React.useEffect(() => {
    if (open) {
      setRows(null);
      load();
    }
  }, [open, load]);

  const resetForm = () => {
    setTitle("");
    setType("EXTERNE");
    setDate(todayIso());
    setProvider("");
    setUrl("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createTraining({
      employeeId,
      title: title.trim(),
      type,
      date,
      provider: provider.trim() || null,
      attestationUrl: url.trim() || "",
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    resetForm();
    await load();
    onChanged?.();
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setError(null);
    const res = await deleteTraining(id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-violet-600" />
            Formations & DPC — {employeeName}
          </DialogTitle>
          <DialogDescription>
            Catalogue des formations suivies. Le suivi DPC (rappel triennal) se
            met à jour automatiquement.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Liste */}
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!loading && rows && rows.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucune formation enregistrée.
            </p>
          )}
          {!loading &&
            rows?.map((t) => (
              <div
                key={t.id}
                className="flex items-start justify-between gap-2 rounded-lg border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                      {TYPE_LABELS[t.type]}
                    </span>
                    <span className="text-sm font-medium">{t.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {frDate(t.date)}
                    {t.provider ? ` · ${t.provider}` : ""}
                  </p>
                  {t.attestationUrl && (
                    <a
                      href={t.attestationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-violet-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Attestation
                    </a>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(t.id)}
                  disabled={busyId === t.id}
                  aria-label="Supprimer la formation"
                >
                  {busyId === t.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
        </div>

        {/* Formulaire d'ajout */}
        <form onSubmit={handleAdd} className="space-y-3 border-t pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">
                Intitulé
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Entretien pharmaceutique AVK"
                className="h-9 w-full rounded-md border px-2.5 text-sm outline-none focus:border-violet-400"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Type
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TrainingType)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-violet-400"
              >
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-violet-400"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Organisme (optionnel)
              </span>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Ex : UTIP, labo…"
                className="h-9 w-full rounded-md border px-2.5 text-sm outline-none focus:border-violet-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Lien attestation (optionnel)
              </span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="h-9 w-full rounded-md border px-2.5 text-sm outline-none focus:border-violet-400"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Ajouter la formation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
