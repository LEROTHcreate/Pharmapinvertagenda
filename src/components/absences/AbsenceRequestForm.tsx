"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
  onCreated: () => void;
};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function AbsenceRequestForm({ open, onClose, onCreated }: Props) {
  const [dateStart, setDateStart] = useState(todayIso());
  const [dateEnd, setDateEnd] = useState(todayIso());
  const [absenceCode, setAbsenceCode] = useState<AbsenceCode>("CONGE");
  const allowedCodes = ABSENCE_CODES;
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
      const res = await fetch("/api/absences", {
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
        setError(err.error ?? "Erreur lors de l'envoi");
        return;
      }
      onCreated();
      onClose();
      // Réinit pour la prochaine ouverture
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
          <DialogTitle>Nouvelle demande d'absence</DialogTitle>
          <DialogDescription>
            Votre demande sera transmise à l'admin pour validation. Une fois
            approuvée, vos créneaux planning sur la période seront marqués
            automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="abs-type">Type</Label>
            <Select
              value={absenceCode}
              onValueChange={(v) => setAbsenceCode(v as AbsenceCode)}
            >
              <SelectTrigger id="abs-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedCodes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ABSENCE_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="abs-start">Du</Label>
              <Input
                id="abs-start"
                type="date"
                value={dateStart}
                min={todayIso()}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="abs-end">Au</Label>
              <Input
                id="abs-end"
                type="date"
                value={dateEnd}
                min={dateStart}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="abs-reason">Motif (optionnel)</Label>
            <textarea
              id="abs-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ex: vacances en famille, rdv médical…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
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
            Envoyer la demande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
