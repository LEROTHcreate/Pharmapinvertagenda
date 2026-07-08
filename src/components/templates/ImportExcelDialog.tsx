"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Check, AlertTriangle } from "lucide-react";
import type { EmployeeStatus } from "@prisma/client";
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
import { TIME_SLOTS, WEEK_DAYS_SHORT } from "@/types";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { parsePastedDay, type ImportEmployee } from "@/lib/excel-import";

export type ImportDialogEmployee = ImportEmployee & { status: EmployeeStatus };

/**
 * Import « colle ton Excel » → crée un gabarit. Pour chaque jour, l'admin colle
 * le tableau copié depuis Excel (prénoms en en-tête, horaires en 1re colonne).
 * On mappe les postes, retrouve les collaborateurs, et on crée le gabarit.
 */
export function ImportExcelDialog({
  open,
  onClose,
  employees,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  employees: ImportDialogEmployee[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [weekType, setWeekType] = useState<"S1" | "S2">("S1");
  const [day, setDay] = useState(0);
  const [texts, setTexts] = useState<string[]>(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);

  const statusById = useMemo(
    () => new Map(employees.map((e) => [e.id, e.status])),
    [employees]
  );

  // Analyse chaque jour collé.
  const results = useMemo(
    () =>
      texts.map((t, d) =>
        t.trim()
          ? parsePastedDay({
              text: t,
              dayOfWeek: d,
              employees,
              timeSlots: TIME_SLOTS,
            })
          : null
      ),
    [texts, employees]
  );

  // Agrège + filtre les postes incompatibles avec le rôle (sinon l'API refuse).
  const { entries, warnings, matched } = useMemo(() => {
    const all: ReturnType<typeof parsePastedDay>["entries"] = [];
    const warns = new Set<string>();
    const names = new Set<string>();
    for (const r of results) {
      if (!r) continue;
      r.matchedNames.forEach((n) => names.add(n));
      r.warnings.forEach((w) => warns.add(w));
      r.unmatchedNames.forEach((n) =>
        warns.add(`Colonne « ${n} » non reconnue dans l'équipe (ignorée).`)
      );
      for (const e of r.entries) {
        if (
          e.type === "TASK" &&
          e.taskCode &&
          !isTaskAllowed(statusById.get(e.employeeId)!, e.taskCode)
        ) {
          warns.add(`Poste ${e.taskCode} incompatible avec un rôle → ignoré.`);
          continue;
        }
        all.push(e);
      }
    }
    return {
      entries: all,
      warnings: Array.from(warns).slice(0, 12),
      matched: names.size,
    };
  }, [results, statusById]);

  async function create() {
    if (!name.trim() || entries.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          weekType,
          description: "Importé depuis Excel",
          entries,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        entryCount?: number;
        error?: string;
      };
      if (!res.ok) {
        toast({
          title: "Import impossible",
          description: data.error ?? "Vérifie le contenu collé et réessaie.",
        });
        return;
      }
      toast({
        title: "Gabarit importé",
        description: `${data.entryCount ?? entries.length} postes créés depuis Excel. Ajuste si besoin.`,
      });
      onCreated();
      onClose();
      // reset
      setName("");
      setTexts(["", "", "", "", "", ""]);
      setDay(0);
    } catch {
      toast({ title: "Import impossible", description: "Connexion échouée." });
    } finally {
      setBusy(false);
    }
  }

  const setDayText = (d: number, v: string) =>
    setTexts((prev) => prev.map((t, i) => (i === d ? v : t)));

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Importer un gabarit depuis Excel
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Pour chaque jour, copie le tableau depuis Excel puis colle-le
            ci-dessous. Mets les <b>prénoms en haut</b> (1re ligne) et les{" "}
            <b>horaires à gauche</b> (1re colonne). Je reconnais les postes
            (Cptoir, Para, Comde…) et les collaborateurs automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Nom + type */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nom du gabarit
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Ex : Semaine standard (depuis Excel)"
                className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
              {(["S1", "S2"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWeekType(t)}
                  className={cn(
                    "h-7 rounded-md px-3 text-[12px] font-semibold transition-colors",
                    weekType === t
                      ? "bg-card text-violet-700 shadow-sm dark:text-violet-300"
                      : "text-muted-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Onglets jours */}
          <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted/40 p-1">
            {WEEK_DAYS_SHORT.map((label, d) => {
              const count = results[d]?.entries.length ?? 0;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  className={cn(
                    "relative h-8 rounded-md px-3 text-[12px] font-medium transition-colors",
                    d === day
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                  {count > 0 && (
                    <span className="ml-1 rounded-full bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Zone de collage du jour */}
          <textarea
            value={texts[day]}
            onChange={(e) => setDayText(day, e.target.value)}
            rows={7}
            placeholder={`Colle ici le tableau de ${WEEK_DAYS_SHORT[day]} (copié depuis Excel)…`}
            className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-2 font-mono text-[11.5px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />

          {/* Récap */}
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-[12px]">
            <p className="font-medium text-foreground">
              {entries.length} poste{entries.length > 1 ? "s" : ""} prêt
              {entries.length > 1 ? "s" : ""} · {matched} collaborateur
              {matched > 1 ? "s" : ""} reconnu{matched > 1 ? "s" : ""}
            </p>
            {warnings.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-amber-700 dark:text-amber-400">
                {warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={create} disabled={busy || !name.trim() || entries.length === 0}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Créer le gabarit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
