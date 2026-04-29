"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Props = {
  weekStart: string; // YYYY-MM-DD du lundi
};

/** Déclenche le download d'un .xlsx pour la semaine courante. */
export function ExportXlsxButton({ weekStart }: Props) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function handleExport() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/export?weekStart=${encodeURIComponent(weekStart)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          tone: "error",
          title: "Export Excel échoué",
          description: err.error ?? "Erreur lors de la génération du fichier",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `planning_${weekStart}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={busy}
      title="Télécharger le planning de la semaine au format Excel"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Excel
    </Button>
  );
}
