"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import type { EmployeeStatus } from "@prisma/client";
import { STATUS_LABELS, type EmployeeDTO } from "@/types";
import { ROLE_PALETTE } from "@/lib/role-colors";
import { cn } from "@/lib/utils";

/**
 * Légende des rôles — pour chaque statut présent dans l'équipe :
 * un petit dégradé de la palette + libellé + effectif.
 * Clarifie immédiatement le code couleur des avatars / chips.
 *
 * Mode FILTRE (optionnel) : si `onToggle` est fourni, chaque rôle devient un
 * bouton cliquable qui filtre le planning sur ce métier. On peut en
 * sélectionner plusieurs. `selected` vide = aucun filtre (tout le monde). Dans
 * ce mode, passer TOUJOURS l'équipe complète (pas la liste filtrée) sinon les
 * rôles masqués disparaîtraient et deviendraient impossibles à re-sélectionner.
 */
export function RolesLegend({
  employees,
  selected,
  onToggle,
  onReset,
}: {
  employees: EmployeeDTO[];
  /** Statuts actuellement sélectionnés (mode filtre). */
  selected?: Set<EmployeeStatus>;
  /** Callback de bascule d'un rôle → active le mode filtre cliquable. */
  onToggle?: (status: EmployeeStatus) => void;
  /** Réinitialise le filtre (affiche tout). */
  onReset?: () => void;
}) {
  const groups = useMemo(() => {
    const counts = new Map<EmployeeStatus, number>();
    employees.forEach((e) => {
      counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [employees]);

  if (groups.length === 0) return null;

  const interactive = !!onToggle;
  const isFiltering = (selected?.size ?? 0) > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-[12px] text-foreground/70">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Rôles
      </span>

      {groups.map(([status, count]) => {
        const isSelected = isFiltering && selected!.has(status);
        // « Actif » = mis en avant : soit aucun filtre (tout visible), soit ce
        // rôle fait partie de la sélection. Sinon on l'atténue.
        const active = !isFiltering || isSelected;

        const inner = (
          <>
            <PaletteDots status={status} />
            <span className={cn(active ? "text-foreground/85" : "text-foreground/60")}>
              {STATUS_LABELS[status]}
              <span className="ml-1 text-muted-foreground/70">· {count}</span>
            </span>
          </>
        );

        if (!interactive) {
          return (
            <div key={status} className="inline-flex items-center gap-2">
              {inner}
            </div>
          );
        }

        return (
          <button
            key={status}
            type="button"
            onClick={() => onToggle!(status)}
            aria-pressed={isSelected}
            title={
              isSelected
                ? `Retirer ${STATUS_LABELS[status]} du filtre`
                : `N'afficher que : ${STATUS_LABELS[status]}`
            }
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 transition-all",
              isSelected
                ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200 shadow-sm"
                : active
                  ? "border-border/70 bg-background/70 hover:border-violet-300 hover:bg-violet-50/40"
                  : "border-transparent opacity-45 grayscale hover:opacity-80 hover:grayscale-0"
            )}
          >
            {inner}
          </button>
        );
      })}

      {interactive && isFiltering && (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-violet-600 transition-colors hover:bg-violet-50"
          title="Afficher tous les métiers"
        >
          <X className="h-3 w-3" />
          Tout afficher
        </button>
      )}
    </div>
  );
}

function PaletteDots({ status }: { status: EmployeeStatus }) {
  const palette = ROLE_PALETTE[status].slice(0, 4);
  return (
    <div className="flex -space-x-1.5">
      {palette.map((c, i) => (
        <span
          key={c}
          className="h-3.5 w-3.5 rounded-full ring-2 ring-white"
          style={{ backgroundColor: c, zIndex: palette.length - i }}
        />
      ))}
    </div>
  );
}
