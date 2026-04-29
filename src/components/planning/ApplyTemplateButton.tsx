"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2, AlertTriangle, LayoutTemplate } from "lucide-react";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Nombre de semaines à remplir : 1 = juste cette semaine, sinon alterne S1/S2 auto */
  const [scopeWeeks, setScopeWeeks] = useState<1 | 4 | 12 | 26 | 52>(1);

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

  const grouped = useMemo(() => {
    const map = new Map<WeekType, TemplateInfo[]>();
    TYPES.forEach((t) => map.set(t, []));
    templates.forEach((t) => map.get(t.weekType)!.push(t));
    return map;
  }, [templates]);

  async function applyTemplate(t: TemplateInfo) {
    setBusy(t.id);
    setError(null);
    try {
      // Si scope > 1 semaine → endpoint rolling avec alternance auto
      const useRolling = scopeWeeks > 1;
      const url = useRolling
        ? `/api/templates/apply-rolling`
        : `/api/templates/${t.id}/apply`;
      const body = useRolling
        ? {
            weekStart,
            weeks: scopeWeeks,
            startWeekType: t.weekType,
            overwrite,
          }
        : { weekStart, overwrite };

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'application");
        return;
      }

      const skippedParts: string[] = [];
      if (data.skippedInactive > 0) {
        skippedParts.push(
          `${data.skippedInactive} ignoré${data.skippedInactive > 1 ? "s" : ""} (collaborateur inactif)`
        );
      }
      if (data.skippedIncompatible > 0) {
        skippedParts.push(
          `${data.skippedIncompatible} ignoré${data.skippedIncompatible > 1 ? "s" : ""} (poste incompatible)`
        );
      }
      const appliedTxt = `${data.applied} créneau${data.applied > 1 ? "x" : ""} créé${data.applied > 1 ? "s" : ""}`;
      const desc = useRolling
        ? `Sur ${scopeWeeks} semaines (${data.breakdown?.length ?? scopeWeeks} cycles S1/S2) · ${appliedTxt}${skippedParts.length > 0 ? " · " + skippedParts.join(" · ") : ""}`
        : skippedParts.length > 0
          ? `${appliedTxt} · ${skippedParts.join(" · ")}`
          : appliedTxt;

      toast({
        tone: data.skippedIncompatible > 0 ? "warning" : "success",
        title: useRolling
          ? `Gabarits appliqués sur ${scopeWeeks} semaines`
          : `« ${t.name} » appliqué`,
        description: desc,
      });
      setOpen(false);
      onApplied();
    } catch {
      setError("Erreur réseau");
    } finally {
      setBusy(null);
    }
  }

  const weekDate = new Date(`${weekStart}T00:00:00`);
  const weekEndDate = new Date(weekDate);
  weekEndDate.setDate(weekEndDate.getDate() + 5);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        Appliquer un gabarit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Appliquer un gabarit à la semaine</DialogTitle>
            <DialogDescription>
              Du {weekDate.toLocaleDateString("fr-FR")} au{" "}
              {weekEndDate.toLocaleDateString("fr-FR")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sélecteur de portée — applique sur N semaines avec alternance auto S1/S2 */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Appliquer sur
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {([1, 4, 12, 26, 52] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScopeWeeks(n)}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-[12px] font-medium transition-all",
                        scopeWeeks === n
                          ? "border-violet-300 bg-violet-50 text-violet-700"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      )}
                    >
                      <div className="font-semibold tabular-nums">{n}</div>
                      <div className="text-[9.5px] uppercase tracking-wide opacity-70">
                        {n === 1
                          ? "semaine"
                          : n === 4
                            ? "1 mois"
                            : n === 12
                              ? "3 mois"
                              : n === 26
                                ? "semestre"
                                : "1 an"}
                      </div>
                    </button>
                  ))}
                </div>
                {scopeWeeks > 1 && (
                  <p className="mt-2 text-[11.5px] text-violet-700/80 leading-snug">
                    💡 Alternance auto : si tu appliques S1, les semaines paires
                    auront S2 et inversement. Si un seul gabarit existe, il sera
                    répété.
                  </p>
                )}
              </div>

              {TYPES.map((type) => {
                const list = grouped.get(type) ?? [];
                return (
                  <div key={type}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Semaine {type}
                    </p>
                    {list.length === 0 ? (
                      <p className="text-[13px] italic text-zinc-400">
                        Aucun gabarit {type} défini.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {list.map((t) => (
                          <div
                            key={t.id}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-xl border border-zinc-200/70 bg-white p-3",
                              busy && busy !== t.id && "opacity-60"
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                                <LayoutTemplate className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium tracking-tight text-zinc-900">
                                  {t.name}
                                </p>
                                <p className="text-[11px] text-zinc-500">
                                  {t.count} créneau{t.count > 1 ? "x" : ""}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => applyTemplate(t)}
                              disabled={busy !== null}
                            >
                              {busy === t.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : null}
                              Appliquer
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <label className="flex items-start gap-2 text-sm cursor-pointer pt-1">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Écraser les modifications existantes</span>
                  <span className="block text-xs text-muted-foreground">
                    Si décoché, les créneaux déjà remplis manuellement sur cette
                    semaine seront préservés.
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
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
