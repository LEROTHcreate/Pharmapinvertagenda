"use client";

import { useEffect, useState } from "react";
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
import type { ConversationDTO } from "@/types/messaging";

type Props = {
  open: boolean;
  onClose: () => void;
  conversation: ConversationDTO;
  currentUserId: string;
  onCreated: () => void;
};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function SwapProposalDialog({
  open,
  onClose,
  conversation,
  currentUserId,
  onCreated,
}: Props) {
  // Membres potentiellement sollicités (= autres membres de la conv)
  const otherMembers = conversation.members.filter(
    (m) => m.userId !== currentUserId
  );

  const [targetId, setTargetId] = useState<string>(
    otherMembers[0]?.userId ?? ""
  );
  const [date, setDate] = useState<string>(todayIso());
  const [fullDay, setFullDay] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<string>("08:30");
  const [endTime, setEndTime] = useState<string>("12:30");
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
    } else {
      setTargetId(otherMembers[0]?.userId ?? "");
    }
    // otherMembers volontairement omis pour ne pas se réinitialiser à chaque rerender
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit() {
    if (!targetId) {
      setError("Sélectionnez le collègue à solliciter");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/swaps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          targetId,
          date,
          fullDay,
          startTime: fullDay ? null : startTime,
          endTime: fullDay ? null : endTime,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur lors de la création");
        return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Demander un échange</DialogTitle>
          <DialogDescription>
            Demandez à un collègue de couvrir votre créneau. Si elle/il accepte,
            la demande est transmise à l'admin pour validation finale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          {conversation.isGroup && (
            <div className="space-y-1.5">
              <Label htmlFor="target">Collègue sollicité</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger id="target">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {otherMembers.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="swap-date">Date</Label>
            <Input
              id="swap-date"
              type="date"
              value={date}
              min={todayIso()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={fullDay}
              onChange={(e) => setFullDay(e.target.checked)}
            />
            Journée entière
          </label>

          {!fullDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="swap-start">Début</Label>
                <Input
                  id="swap-start"
                  type="time"
                  value={startTime}
                  step={1800}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="swap-end">Fin</Label>
                <Input
                  id="swap-end"
                  type="time"
                  value={endTime}
                  step={1800}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="swap-reason">Motif (optionnel)</Label>
            <textarea
              id="swap-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ex: rdv médical…"
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
          <Button
            onClick={handleSubmit}
            disabled={busy || !targetId || (!fullDay && startTime >= endTime)}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Envoyer la demande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
