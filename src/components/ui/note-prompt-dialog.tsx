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

type Props = {
  open: boolean;
  title: string;
  description?: string;
  /** Placeholder du textarea */
  placeholder?: string;
  /** Texte du bouton de confirmation */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Le motif est-il obligatoire ? Si false, peut être vide. */
  required?: boolean;
  /** "destructive" → bouton rouge (refus, etc.) */
  variant?: "default" | "destructive";
  onSubmit: (note: string) => Promise<void> | void;
  onClose: () => void;
};

/**
 * Dialog avec textarea — remplace `window.prompt()` pour saisir un motif
 * (refus, annulation, note admin…). Le résultat est passé à `onSubmit`.
 */
export function NotePromptDialog({
  open,
  title,
  description,
  placeholder = "Motif (optionnel)…",
  confirmLabel = "Envoyer",
  cancelLabel = "Annuler",
  required = false,
  variant = "default",
  onSubmit,
  onClose,
}: Props) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  const trimmed = note.trim();
  const canSubmit = required ? trimmed.length > 0 : true;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder={placeholder}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 resize-none"
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleSubmit}
            disabled={busy || !canSubmit}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
