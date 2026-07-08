"use client";

import { useState } from "react";
import { Wand2, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Bouton « Remplir automatiquement » — applique le gabarit par défaut de la
 * semaine (S1/S2 selon la parité) puis complète la couverture COMPTOIR jusqu'au
 * seuil mini sur les heures d'ouverture, SANS écraser l'existant (absences,
 * postes déjà saisis). L'admin ajuste ensuite.
 */
export function AutoFillButton({
  weekStart,
  onApplied,
}: {
  weekStart: string;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/planning/auto-fill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        added?: number;
        gabaritApplied?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        toast({
          title: "Remplissage impossible",
          description:
            data.message ??
            "Une erreur est survenue. Réessaie dans un instant.",
        });
        return;
      }
      setOpen(false);
      const added = data.added ?? 0;
      toast({
        title: "Semaine remplie",
        description:
          added > 0
            ? `${added} créneau${added > 1 ? "x" : ""} de comptoir ajouté${added > 1 ? "s" : ""}${data.gabaritApplied ? " (gabarit appliqué)" : ""}. Ajuste si besoin.`
            : data.gabaritApplied
              ? "Gabarit appliqué. Le comptoir était déjà couvert."
              : "Rien à compléter : le comptoir est déjà couvert.",
      });
      onApplied();
    } catch {
      toast({
        title: "Remplissage impossible",
        description: "Connexion échouée. Réessaie.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        title="Remplir automatiquement la semaine (gabarit + comptoir)"
      >
        <Wand2 className="h-4 w-4" />
        Remplir auto
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-violet-600" />
              Remplir automatiquement la semaine
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1 text-[13px] leading-relaxed">
              <span className="block">
                J&apos;applique ton <b>gabarit par défaut</b> de la semaine, puis
                je <b>complète le comptoir</b> jusqu&apos;au seuil mini sur tes
                heures d&apos;ouverture.
              </span>
              <span className="block text-muted-foreground">
                Je respecte les <b>absences validées</b>, les{" "}
                <b>indisponibilités</b> et les <b>heures contractuelles</b>, et je
                ne touche <b>jamais</b> aux cases déjà remplies. Tu ajustes ensuite.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={run} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Remplir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
