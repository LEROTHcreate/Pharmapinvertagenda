"use client";

import { useMemo } from "react";
import type { EmployeeStatus } from "@prisma/client";
import { STATUS_LABELS, type EmployeeDTO } from "@/types";
import { ROLE_PALETTE } from "@/lib/role-colors";

/**
 * Légende des rôles — pour chaque statut présent dans l'équipe :
 * un petit dégradé de la palette + libellé + effectif.
 * Clarifie immédiatement le code couleur des avatars / chips.
 */
export function RolesLegend({ employees }: { employees: EmployeeDTO[] }) {
  const groups = useMemo(() => {
    const counts = new Map<EmployeeStatus, number>();
    employees.forEach((e) => {
      counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [employees]);

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-zinc-200/60 bg-white/60 px-3 py-2 text-[12px] text-zinc-600">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Rôles
      </span>
      {groups.map(([status, count]) => (
        <div key={status} className="inline-flex items-center gap-2">
          <PaletteDots status={status} />
          <span className="text-zinc-700">
            {STATUS_LABELS[status]}
            <span className="ml-1 text-zinc-400">· {count}</span>
          </span>
        </div>
      ))}
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
