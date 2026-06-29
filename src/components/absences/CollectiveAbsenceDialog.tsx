"use client";

import { useState } from "react";
import { Loader2, Users, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ABSENCE_LABELS } from "@/types";
import { ABSENCE_CODES } from "@/validators/absence";
import type { AbsenceCode } from "@prisma/client";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Appelé après création réussie, avec le nombre de collaborateurs marqués. */
  onCreated: (count: number) => void;
};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Dialog "Absence collective / fermeture" — admin marque TOUTE l'équipe active
 * absente sur une plage en un clic (ex. jour férié, pont, fermeture annuelle).
 * Applique directement sur le planning (créneaux existants → ABSENCE).
 */
export function CollectiveAbsenceDialog({ open, onClose, onCreated }: Props) {
  const [dateStart, setDateStart] = useState(todayIso());
  const [dateEnd, setDateEnd] = useState(todayIso());
  const [absenceCode, setAbsenceCode] = useState<AbsenceCode>("CONGE");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (dateStart > dateEnd) {
      setError("La date de début doit être avant la date de fin");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/absences/collective", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dateStart,
          dateEnd,
          absenceCode,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur lors de l'application");
        return;
      }
      const data = (await res.json()) as { employees: number };
      onCreated(data.employees);
      onClose();
      setDateStart(todayIso());
      setDateEnd(todayIso());
      setAbsenceCode("CONGE");
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-600" />
            Absence collective / fermeture
          </DialogTitle>
          <DialogDescription>
            Marque <strong>toute l&apos;équipe active</strong> absente sur la
            période. Les créneaux planifiés de chacun seront convertis en
            absence. Idéal pour un jour férié, un pont ou une fermeture annuelle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="coll-type">Type</Label>
            <Select
              value={absenceCode}
              onValueChange={(v) => setAbsenceCode(v as AbsenceCode)}
            >
              <SelectTrigger id="coll-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_CODES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ABSENCE_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="coll-start">Du</Label>
              <Input
                id="coll-start"
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coll-end">Au</Label>
              <Input
                id="coll-end"
                type="date"
                value={dateEnd}
                min={dateStart}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coll-reason">Motif (optionnel)</Label>
            <textarea
              id="coll-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ex: fermeture 15 août, pont de l'Ascension…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 resize-none"
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-[11.5px] leading-snug text-amber-800 dark:text-amber-200">
              Action immédiate sur le planning de tous les collaborateurs actifs.
              Tu pourras annuler l&apos;absence d&apos;un collaborateur depuis la
              liste si besoin (le planning d&apos;origine sera restauré).
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Appliquer à toute l&apos;équipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
