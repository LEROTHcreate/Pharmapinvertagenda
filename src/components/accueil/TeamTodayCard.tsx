import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import type { PersonRef, AbsentRef } from "@/components/accueil/types";

/** Pastille d'initiale colorée (couleur planning du collaborateur). */
function Bubble({ name, color }: { name: string; color: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      title={name}
      className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold text-white ring-2 ring-card"
      style={{ background: color }}
    >
      {initial}
    </span>
  );
}

/**
 * « L'équipe aujourd'hui » — qui travaille (pastilles), combien sur l'effectif
 * total, et qui est absent (congé/maladie…). Vue serveur.
 */
export function TeamTodayCard({
  present,
  absents,
  teamSize,
}: {
  present: PersonRef[];
  absents: AbsentRef[];
  teamSize: number;
}) {
  const shown = present.slice(0, 7);
  const extra = present.length - shown.length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Users className="h-4 w-4" />
          </span>
          <h2 className="text-[13.5px] font-semibold tracking-tight text-foreground">
            L&apos;équipe aujourd&apos;hui
          </h2>
        </div>
        <span className="text-[12px] font-semibold tabular-nums text-foreground">
          {present.length}
          <span className="text-muted-foreground/60"> / {teamSize}</span>
        </span>
      </div>

      {present.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Personne planifié aujourd&apos;hui.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((p) => (
            <Bubble key={p.id} name={p.name} color={p.color} />
          ))}
          {extra > 0 && (
            <span className="flex h-8 items-center justify-center rounded-full bg-muted px-2.5 text-[12px] font-semibold text-muted-foreground">
              +{extra}
            </span>
          )}
        </div>
      )}

      {absents.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Absents
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {absents.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              >
                {a.name}
                <span className="text-[10px] text-amber-600/80 dark:text-amber-400/70">
                  · {a.label}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <Link
        href="/planning"
        className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
      >
        Ouvrir le planning <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
