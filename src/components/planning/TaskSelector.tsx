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
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { getAllowedTasks } from "@/lib/role-task-rules";
import type { AbsenceCode, TaskCode } from "@prisma/client";
import {
  ApplyScopeSelector,
  type ApplyScope,
} from "@/components/planning/ApplyScopeSelector";

const ABSENCES: AbsenceCode[] = ["ABSENT", "CONGE", "MALADIE", "FORMATION_ABS"];

export type SavePayload = {
  type: "TASK" | "ABSENCE";
  taskCode?: TaskCode | null;
  absenceCode?: AbsenceCode | null;
  /** Portée d'application — voir ApplyScope */
  scope: ApplyScope;
};

export type ClearPayload = {
  scope: ApplyScope;
};

export function TaskSelector({
  open,
  employee,
  date,
  timeSlot,
  currentEntry,
  weekKind,
  onClose,
  onSave,
  onClear,
}: {
  open: boolean;
  employee: EmployeeDTO;
  date: string;
  timeSlot: string;
  currentEntry: ScheduleEntryDTO | null;
  /** Type de la semaine éditée — pour proposer "Toutes les S1/S2 de l'année" */
  weekKind?: "S1" | "S2";
  onClose: () => void;
  onSave: (payload: SavePayload) => Promise<void>;
  onClear: (payload: ClearPayload) => Promise<void>;
}) {
  const allowedTasks = useMemo(
    () => getAllowedTasks(employee.status),
    [employee.status]
  );
  const [scope, setScope] = useState<ApplyScope>("1"); // défaut : modification ponctuelle

  // Fire-and-forget : le parent gère l'optimistic update + revert en cas d'erreur,
  // pas besoin d'attendre la réponse réseau ici. Le modal se ferme dès que
  // le parent met `selection=null` (synchrone, dans la même tick que l'appel).
  const pending = false;

  function pick(code: TaskCode) {
    void onSave({ type: "TASK", taskCode: code, scope });
  }

  function pickAbsence(code: AbsenceCode) {
    void onSave({ type: "ABSENCE", absenceCode: code, scope });
  }

  function clear() {
    void onClear({ scope });
  }

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {employee.firstName} {employee.lastName}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {STATUS_LABELS[employee.status]}
            </span>
          </DialogTitle>
          <DialogDescription>
            {dateLabel} · {timeSlot}
            {currentEntry && (
              <span className="ml-2 italic">
                — actuellement :{" "}
                {currentEntry.type === "TASK" && currentEntry.taskCode
                  ? TASK_LABELS[currentEntry.taskCode]
                  : currentEntry.absenceCode
                    ? ABSENCE_LABELS[currentEntry.absenceCode]
                    : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scope d'application : cette semaine ou répliquer sur N semaines */}
          <ApplyScopeSelector
            value={scope}
            onChange={setScope}
            disabled={pending}
            weekKind={weekKind}
          />

          <Separator />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Postes autorisés
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {allowedTasks.map((code) => {
                const c = TASK_COLORS[code];
                const active =
                  currentEntry?.type === "TASK" && currentEntry.taskCode === code;
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={pending}
                    onClick={() => pick(code)}
                    className={cn(
                      "rounded-md border-2 px-3 py-2 text-left text-sm font-medium transition hover:scale-[1.02] disabled:opacity-60",
                      active && "ring-2 ring-offset-1 ring-violet-500"
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
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Absences
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ABSENCES.map((code) => {
                const s = ABSENCE_STYLES[code];
                const active =
                  currentEntry?.type === "ABSENCE" &&
                  currentEntry.absenceCode === code;
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={pending}
                    onClick={() => pickAbsence(code)}
                    className={cn(
                      "rounded-md border-2 px-3 py-2 text-sm font-medium transition hover:scale-[1.02] disabled:opacity-60",
                      active && "ring-2 ring-offset-1 ring-violet-500"
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
            onClick={clear}
            disabled={pending || !currentEntry}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Effacer le créneau
          </Button>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
