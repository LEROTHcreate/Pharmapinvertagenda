"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  LayoutTemplate,
  Check,
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
import { useToast } from "@/components/ui/toast";

type TemplateInfo = {
  id: string;
  name: string;
  weekType: WeekType;
  count: number;
};

const TYPES: WeekType[] = ["S1", "S2"];

/** Choix de durée : N est interprété selon la sélection.
 *  - 1 gabarit seul → N occurrences de ce type (ex: 4 S1 = 8 sem. calendaires)
 *  - 2 gabarits     → N semaines calendaires consécutives (alternance auto) */
const DURATION_OPTIONS: Array<{ value: number; label: string; sub: string }> = [
  { value: 1, label: "Cette semaine", sub: "uniquement" },
  { value: 4, label: "4 semaines", sub: "≈ 1 mois" },
  { value: 8, label: "8 semaines", sub: "≈ 2 mois" },
  { value: 12, label: "12 semaines", sub: "≈ 3 mois" },
  { value: 26, label: "26 semaines", sub: "≈ 6 mois" },
];

export function ApplyTemplateButton({
  weekStart,
  onApplied,
}: {
  weekStart: string;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [deleteAbsences, setDeleteAbsences] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sélection : un id par type (ou null si rien choisi)
  const [s1Id, setS1Id] = useState<string | null>(null);
  const [s2Id, setS2Id] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(1);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const list: TemplateInfo[] = (data.templates ?? []).map(
          (t: {
            id: string;
            name: string;
            weekType: WeekType;
            entries: unknown[];
          }) => ({
            id: t.id,
            name: t.name,
            weekType: t.weekType,
            count: Array.isArray(t.entries) ? t.entries.length : 0,
          })
        );
        setTemplates(list);
      })
      .catch(() => setError("Impossible de charger les gabarits"))
      .finally(() => setLoading(false));
  }, [open]);

  // Reset les sélections quand on ferme le modal
  useEffect(() => {
    if (!open) {
      setS1Id(null);
      setS2Id(null);
      setDuration(1);
      setOverwrite(false);
      setDeleteAbsences(false);
      setError(null);
    }
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<WeekType, TemplateInfo[]>();
    TYPES.forEach((t) => map.set(t, []));
    templates.forEach((t) => map.get(t.weekType)!.push(t));
    return map;
  }, [templates]);

  const canApply = (s1Id !== null || s2Id !== null) && !busy;

  async function applyBatch() {
    if (!canApply) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/apply-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          s1TemplateId: s1Id ?? undefined,
          s2TemplateId: s2Id ?? undefined,
          weekStart,
          weeks: duration,
          overwrite,
          deleteAbsences,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'application");
        return;
      }

      const parts: string[] = [];
      if (data.s1Name) parts.push(`S1 « ${data.s1Name} »`);
      if (data.s2Name) parts.push(`S2 « ${data.s2Name} »`);

      const detailsParts: string[] = [];
      if (data.skippedIncompatible > 0) {
        detailsParts.push(`${data.skippedIncompatible} ignoré(s) (rôle incompatible)`);
      }
      if (data.skippedAbsence > 0) {
        const conflicts = (data.absenceConflicts as Array<{ employeeName: string; days: number }> | undefined) ?? [];
        const names = conflicts
          .map((c) => `${c.employeeName} (${c.days}j)`)
          .join(", ");
        detailsParts.push(`absences préservées : ${names}`);
      }

      toast({
        tone:
          data.skippedAbsence > 0 || data.skippedIncompatible > 0
            ? "warning"
            : "success",
        title: `Gabarit${parts.length > 1 ? "s" : ""} appliqué${parts.length > 1 ? "s" : ""}`,
        description: `${parts.join(" + ")} sur ${data.weeksApplied} semaine${data.weeksApplied > 1 ? "s" : ""} · ${data.applied} créneaux${detailsParts.length > 0 ? " · " + detailsParts.join(" · ") : ""}`,
        duration: data.skippedAbsence > 0 ? 8000 : 4000,
      });
      setOpen(false);
      onApplied();
    } catch {
      setError("Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        Appliquer un gabarit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appliquer un ou deux gabarits</DialogTitle>
            <DialogDescription>
              Choisis un gabarit S1, un S2, ou les deux. Les semaines impaires
              recevront S1, les paires recevront S2 (selon le numéro ISO).
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* ─── Sélection S1 / S2 côte à côte ─── */}
              <div className="grid gap-4 sm:grid-cols-2">
                {TYPES.map((type) => {
                  const list = grouped.get(type) ?? [];
                  const selectedId = type === "S1" ? s1Id : s2Id;
                  const setSelected = type === "S1" ? setS1Id : setS2Id;
                  return (
                    <div key={type}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Gabarit pour les semaines {type}
                      </p>
                      {list.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] italic text-muted-foreground/70">
                          Aucun gabarit {type}
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          <TemplateRadio
                            label="— Aucun —"
                            sub="Ne pas appliquer"
                            selected={selectedId === null}
                            onSelect={() => setSelected(null)}
                            disabled={busy}
                            muted
                          />
                          {list.map((t) => (
                            <TemplateRadio
                              key={t.id}
                              label={t.name}
                              sub={`${t.count} créneau${t.count > 1 ? "x" : ""}`}
                              selected={selectedId === t.id}
                              onSelect={() => setSelected(t.id)}
                              disabled={busy}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ─── Durée ─── */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Appliquer sur
                </p>
                <div className="inline-flex flex-wrap items-stretch gap-0.5 rounded-xl bg-muted/40 p-1 ring-1 ring-inset ring-border">
                  {DURATION_OPTIONS.map((opt) => {
                    const active = duration === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={busy}
                        onClick={() => setDuration(opt.value)}
                        className={cn(
                          "flex flex-col items-center justify-center rounded-lg px-3 py-1.5 transition-all duration-150",
                          active
                            ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                            : "text-foreground/70 hover:text-foreground"
                        )}
                      >
                        <span className="text-[12px] font-medium leading-tight">
                          {opt.label}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] leading-tight",
                            active ? "text-muted-foreground" : "text-muted-foreground/70"
                          )}
                        >
                          {opt.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {durationHelp({ s1: !!s1Id, s2: !!s2Id, n: duration })}
                </p>
              </div>

              {/* ─── Overwrite ─── */}
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  <span className="font-medium">
                    Écraser les modifications existantes
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Si décoché, les créneaux déjà remplis manuellement sont
                    préservés.
                  </span>
                </span>
              </label>

              {/* ─── Suppression des absences ─── */}
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={deleteAbsences}
                  onChange={(e) => setDeleteAbsences(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  <span className="font-medium">
                    Supprimer les absences existantes
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Si coché, les congés/absences sur la plage sont effacés
                    avant l&apos;application du gabarit. Sinon ils sont préservés
                    (un congé approuvé prime sur le gabarit).
                  </span>
                </span>
              </label>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={applyBatch} disabled={!canApply}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Sous-composants ──────────────────────────────────────────── */

function TemplateRadio({
  label,
  sub,
  selected,
  onSelect,
  disabled,
  muted,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all duration-150",
        selected
          ? "border-violet-300 bg-violet-50 ring-1 ring-violet-200"
          : "border-border/70 bg-card hover:border-border",
        disabled && "opacity-60",
        muted && !selected && "bg-muted/40"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          selected
            ? "bg-violet-100 text-violet-700"
            : muted
              ? "bg-muted text-muted-foreground/70"
              : "bg-muted/40 text-muted-foreground"
        )}
      >
        {selected ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : (
          <LayoutTemplate className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
          {label}
        </p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </button>
  );
}

function durationHelp(opts: { s1: boolean; s2: boolean; n: number }): string {
  if (!opts.s1 && !opts.s2) {
    return "Sélectionne un gabarit S1 ou S2 ci-dessus.";
  }
  if (opts.s1 && opts.s2) {
    return `Application sur ${opts.n} semaine${opts.n > 1 ? "s" : ""} consécutive${opts.n > 1 ? "s" : ""} avec alternance automatique S1/S2.`;
  }
  const type = opts.s1 ? "S1" : "S2";
  if (opts.n === 1) {
    return `Appliqué uniquement sur la prochaine semaine ${type} (à partir de la semaine en cours).`;
  }
  return `Appliqué sur les ${opts.n} prochaines semaines ${type} (≈ ${opts.n * 2} semaines calendaires).`;
}
