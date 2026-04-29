"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ABSENCE_ICONS,
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_DESCRIPTIONS,
  TASK_LABELS,
} from "@/types";
import type { EmployeeDTO } from "@/types";
import { getAllowedTasks } from "@/lib/role-task-rules";
import type { AbsenceCode, EmployeeStatus, TaskCode } from "@prisma/client";
import {
  ApplyScopeSelector,
  type ApplyScope,
} from "@/components/planning/ApplyScopeSelector";

const ABSENCES: AbsenceCode[] = ["ABSENT", "CONGE", "MALADIE", "FORMATION_ABS"];

type SelectionCell = {
  employeeId: string;
  date: string;
  timeSlot: string;
};

export type BulkApplyPayload = {
  type: "TASK" | "ABSENCE";
  taskCode?: TaskCode | null;
  absenceCode?: AbsenceCode | null;
  scope: ApplyScope;
};

/**
 * Modal d'application en bulk d'un poste/absence à plusieurs cellules.
 * Affiche uniquement les postes autorisés pour TOUS les statuts impliqués (intersection).
 */
export function BulkTaskSelector({
  open,
  cells,
  employees,
  weekKind,
  onClose,
  onApply,
  onClearAll,
}: {
  open: boolean;
  cells: SelectionCell[];
  employees: EmployeeDTO[];
  weekKind?: "S1" | "S2";
  onClose: () => void;
  onApply: (payload: BulkApplyPayload) => Promise<void>;
  onClearAll: (payload: { scope: ApplyScope }) => Promise<void>;
}) {
  const [scope, setScope] = useState<ApplyScope>("1");
  // Fire-and-forget : le parent gère l'optimistic update + revert.
  const pending = false;

  // Statuts uniques des collaborateurs concernés
  const involvedStatuses = useMemo<EmployeeStatus[]>(() => {
    const empIds = Array.from(new Set(cells.map((c) => c.employeeId)));
    const statuses = new Set<EmployeeStatus>();
    empIds.forEach((id) => {
      const emp = employees.find((e) => e.id === id);
      if (emp) statuses.add(emp.status);
    });
    return Array.from(statuses);
  }, [cells, employees]);

  // Intersection des postes autorisés (pour ne pas proposer un poste qui sera rejeté pour un collaborateur)
  const allowedTasks = useMemo<TaskCode[]>(() => {
    if (involvedStatuses.length === 0) return [];
    const sets = involvedStatuses.map((s) => new Set(getAllowedTasks(s)));
    const first = sets[0];
    return Array.from(first).filter((task) =>
      sets.every((s) => s.has(task))
    ) as TaskCode[];
  }, [involvedStatuses]);

  // Stats : combien de collaborateurs et de créneaux uniques
  const summary = useMemo(() => {
    const empIds = new Set(cells.map((c) => c.employeeId));
    const slots = new Set(cells.map((c) => `${c.date}|${c.timeSlot}`));
    return { employees: empIds.size, slots: slots.size, total: cells.length };
  }, [cells]);

  function pickTask(code: TaskCode) {
    void onApply({ type: "TASK", taskCode: code, scope });
  }

  function pickAbsence(code: AbsenceCode) {
    void onApply({ type: "ABSENCE", absenceCode: code, scope });
  }

  function clearSelection() {
    void onClearAll({ scope });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Appliquer un poste à {summary.total} créneau
            {summary.total > 1 ? "x" : ""}
          </DialogTitle>
          <DialogDescription>
            {summary.employees} collaborateur{summary.employees > 1 ? "s" : ""} ·{" "}
            {summary.slots} créneau{summary.slots > 1 ? "x" : ""} horaire
            {summary.slots > 1 ? "s" : ""}
            {involvedStatuses.length > 0 && (
              <>
                {" "}
                · Statuts :{" "}
                <span className="font-medium">
                  {involvedStatuses.map((s) => STATUS_LABELS[s]).join(", ")}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ApplyScopeSelector
            value={scope}
            onChange={setScope}
            disabled={pending}
            weekKind={weekKind}
          />

          <Separator />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Postes autorisés pour tous les collaborateurs sélectionnés
            </p>
            {allowedTasks.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Aucun poste commun à tous les statuts sélectionnés. Réduis ta
                sélection à des collaborateurs du même métier.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {allowedTasks.map((code) => {
                  const c = TASK_COLORS[code];
                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={pending}
                      onClick={() => pickTask(code)}
                      className={cn(
                        "rounded-md border-2 px-3 py-2 text-left text-sm font-medium transition hover:scale-[1.02] disabled:opacity-60"
                      )}
                      style={{
                        background: c.bg,
                        color: c.text,
                        borderColor: c.border,
                      }}
                    >
                      <div className="font-bold">{TASK_LABELS[code]}</div>
                      <div className="text-[10px] opacity-80">
                        {TASK_DESCRIPTIONS[code]}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Absences (toujours applicables)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ABSENCES.map((code) => {
                const s = ABSENCE_STYLES[code];
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={pending}
                    onClick={() => pickAbsence(code)}
                    className={cn(
                      "rounded-md border-2 px-3 py-2 text-sm font-medium transition hover:scale-[1.02] disabled:opacity-60"
                    )}
                    style={{
                      background: s.bg,
                      color: s.text,
                      borderColor: s.border,
                    }}
                  >
                    <span className="text-base mr-1">{ABSENCE_ICONS[code]}</span>
                    {ABSENCE_LABELS[code]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Effacer les {summary.total} créneaux
          </Button>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
