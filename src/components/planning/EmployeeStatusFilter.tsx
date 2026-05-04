"use client";

import { Check, Filter } from "lucide-react";
import type { EmployeeStatus } from "@prisma/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABELS } from "@/types";
import { cn } from "@/lib/utils";

const ALL_STATUSES: EmployeeStatus[] = [
  "TITULAIRE",
  "PHARMACIEN",
  "PREPARATEUR",
  "ETUDIANT",
  "LIVREUR",
  "BACK_OFFICE",
  "SECRETAIRE",
];

/**
 * Filtre multi-statut. Stocke la sélection sous forme d'un Set<EmployeeStatus>.
 * Set vide = aucun filtre actif (= tous visibles, comportement par défaut).
 */
export function EmployeeStatusFilter({
  selected,
  onChange,
}: {
  selected: Set<EmployeeStatus>;
  onChange: (next: Set<EmployeeStatus>) => void;
}) {
  const isFiltering = selected.size > 0;
  const count = selected.size;

  function toggle(status: EmployeeStatus) {
    const next = new Set(selected);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onChange(next);
  }

  function clearAll() {
    onChange(new Set());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 h-8 rounded-md border bg-card px-2.5 text-[12px] font-medium transition-colors",
            isFiltering
              ? "border-violet-300 bg-violet-50 text-violet-700"
              : "border-border text-foreground/85 hover:bg-muted/40"
          )}
          aria-label="Filtrer par statut"
        >
          <Filter className="h-3.5 w-3.5" />
          {isFiltering ? `${count} statut${count > 1 ? "s" : ""}` : "Filtrer"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Afficher uniquement
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_STATUSES.map((s) => {
          const isSelected = selected.has(s);
          return (
            <DropdownMenuItem
              key={s}
              onClick={(e) => {
                e.preventDefault();
                toggle(s);
              }}
              onSelect={(e) => e.preventDefault() /* garde le menu ouvert */}
              className="cursor-pointer"
            >
              <span
                className={cn(
                  "inline-flex h-4 w-4 items-center justify-center rounded border",
                  isSelected
                    ? "border-violet-500 bg-violet-500 text-white"
                    : "border-border bg-card"
                )}
              >
                {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              {STATUS_LABELS[s]}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={clearAll}
          disabled={!isFiltering}
          className="text-[12px] text-foreground/70"
        >
          Réinitialiser (tout afficher)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
