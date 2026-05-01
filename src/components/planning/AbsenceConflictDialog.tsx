"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ABSENCE_LABELS } from "@/types";
import type { AbsenceCode } from "@prisma/client";

export type AbsenceConflict = {
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // HH:MM
  absenceCode: AbsenceCode;
};

type Props = {
  open: boolean;
  conflicts: AbsenceConflict[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

/**
 * Dialog d'avertissement quand un admin tente d'écrire un poste sur des
 * créneaux couverts par une absence approuvée. Liste les conflits, propose
 * d'annuler ou de forcer.
 */
export function AbsenceConflictDialog({
  open,
  conflicts,
  onConfirm,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);

  // Regroupe par (employeeName + absenceCode) pour un affichage compact
  const groups = (() => {
    const map = new Map<
      string,
      { employeeName: string; absenceCode: AbsenceCode; dates: Set<string> }
    >();
    for (const c of conflicts) {
      const key = `${c.employeeId}|${c.absenceCode}`;
      let g = map.get(key);
      if (!g) {
        g = {
          employeeName: c.employeeName,
          absenceCode: c.absenceCode,
          dates: new Set(),
        };
        map.set(key, g);
      }
      g.dates.add(c.date);
    }
    return Array.from(map.values());
  })();

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onCancel() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Conflit avec une absence approuvée
          </DialogTitle>
          <DialogDescription>
            {conflicts.length === 1
              ? "Un créneau visé est couvert par une absence déjà validée par un admin :"
              : `${conflicts.length} créneaux visés sont couverts par des absences déjà validées :`}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 max-h-60 overflow-y-auto">
          {groups.map((g, i) => (
            <li
              key={i}
              className="rounded-lg border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-[13px]"
            >
              <p className="font-semibold text-amber-900">
                {g.employeeName}
                <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 align-middle">
                  {ABSENCE_LABELS[g.absenceCode]}
                </span>
              </p>
              <p className="text-amber-700 text-[12px] mt-0.5 tabular-nums">
                {Array.from(g.dates)
                  .sort()
                  .map((d) =>
                    new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })
                  )
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>

        <p className="text-[12.5px] text-zinc-500">
          En continuant, le poste sera quand même écrit, écrasant l'absence
          sur ces créneaux.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Forcer l'écriture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
