"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, CalendarX, ThumbsDown, ThumbsUp } from "lucide-react";
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

  // Souhait de disponibilité déclaré par l'employé pour CE jour — on avertit
  // l'admin s'il planifie quelqu'un qui a posé une indisponibilité/préférence.
  // Best-effort : si le fetch échoue, on n'affiche rien (bonus, pas bloquant).
  const [wish, setWish] = useState<{
    kind: "UNAVAILABLE" | "PREFER_OFF" | "PREFER_WORK";
    note: string | null;
  } | null>(null);
  useEffect(() => {
    if (!open) {
      setWish(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/availability-wishes?scope=cell&employeeId=${encodeURIComponent(employee.id)}&date=${date}`
        );
        if (!res.ok) return;
        const d = await res.json().catch(() => ({}));
        if (!cancelled) setWish(d.wish ?? null);
      } catch {
        /* silencieux */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, employee.id, date]);

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
          {/* Avertissement disponibilité déclarée par l'employé pour ce jour */}
          {wish && (() => {
            const cfg = {
              UNAVAILABLE: {
                Icon: CalendarX,
                cls: "border-rose-200/70 bg-rose-50/70 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200",
                iconCls: "text-rose-600 dark:text-rose-400",
                label: `${employee.firstName} a déclaré une indisponibilité ce jour`,
              },
              PREFER_OFF: {
                Icon: ThumbsDown,
                cls: "border-amber-200/70 bg-amber-50/70 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200",
                iconCls: "text-amber-600 dark:text-amber-400",
                label: `${employee.firstName} préfère ne pas travailler ce jour`,
              },
              PREFER_WORK: {
                Icon: ThumbsUp,
                cls: "border-emerald-200/70 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200",
                iconCls: "text-emerald-600 dark:text-emerald-400",
                label: `${employee.firstName} préfère travailler ce jour`,
              },
            }[wish.kind];
            const Icon = cfg.Icon;
            return (
              <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5", cfg.cls)}>
                <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", cfg.iconCls)} />
                <div className="min-w-0 text-[12.5px] leading-snug">
                  <span className="font-medium">{cfg.label}</span>
                  {wish.note && <span className="opacity-80"> — « {wish.note} »</span>}
                </div>
              </div>
            );
          })()}

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
