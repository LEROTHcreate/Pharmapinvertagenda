"use client";

import { Users, X } from "lucide-react";

/**
 * État vide des vues d'ensemble (semaine / mois) : soit l'équipe est vide,
 * soit le filtre métier ne correspond à personne. Message clair + bouton de
 * réinitialisation quand un filtre est en cause.
 */
export function OverviewEmptyState({
  filtering,
  onReset,
}: {
  filtering: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-500">
        <Users className="h-6 w-6" />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-foreground">
          {filtering
            ? "Aucun collaborateur pour ce filtre"
            : "Aucun collaborateur"}
        </p>
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
          {filtering
            ? "Aucun des métiers sélectionnés n'a de collaborateur sur cette période. Choisissez un autre métier ou réinitialisez le filtre."
            : "Ajoutez des collaborateurs depuis la page Équipe pour voir le planning."}
        </p>
      </div>
      {filtering && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:border-violet-300 hover:bg-violet-50"
        >
          <X className="h-3.5 w-3.5" />
          Réinitialiser le filtre
        </button>
      )}
    </div>
  );
}
