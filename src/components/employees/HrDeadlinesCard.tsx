import {
  AlarmClock,
  BadgeCheck,
  CalendarClock,
  GraduationCap,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeadlineKind, HrDeadline } from "@/lib/hr-deadlines";

const ICONS: Record<DeadlineKind, typeof AlarmClock> = {
  cdd_end: CalendarClock,
  trial_end: UserCheck,
  medical_visit: Stethoscope,
  professional_interview: BadgeCheck,
  dpc: GraduationCap,
};

function whenLabel(daysUntil: number): string {
  if (daysUntil < 0) return `en retard de ${Math.abs(daysUntil)} j`;
  if (daysUntil === 0) return "aujourd'hui";
  if (daysUntil === 1) return "demain";
  return `dans ${daysUntil} j`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Carte « Échéances RH à venir » affichée en haut de la page Équipe.
 * Rappels : fin de CDD, fin de période d'essai, visite médicale, entretien
 * professionnel, DPC. Données indicatives (cf. lib hr-deadlines).
 */
export function HrDeadlinesCard({ deadlines }: { deadlines: HrDeadline[] }) {
  if (deadlines.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center gap-2.5">
        <BadgeCheck className="h-4 w-4 text-emerald-600" />
        <p className="text-[13px] text-muted-foreground">
          Aucune échéance RH dans les prochaines semaines.
        </p>
      </div>
    );
  }

  const overdue = deadlines.filter((d) => d.level === "overdue").length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <AlarmClock className="h-4 w-4 text-violet-600" />
        <h2 className="text-[13px] font-semibold text-zinc-800">
          Échéances RH à venir
        </h2>
        <span className="text-[12px] text-muted-foreground">
          · {deadlines.length}
          {overdue > 0 && (
            <span className="text-red-600 font-medium"> · {overdue} en retard</span>
          )}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {deadlines.map((d, i) => {
          const Icon = ICONS[d.kind];
          const tone =
            d.level === "overdue"
              ? "text-red-700 bg-red-50 dark:bg-red-950/30"
              : d.level === "soon"
                ? "text-amber-700 bg-amber-50 dark:bg-amber-950/30"
                : "text-violet-700 bg-violet-50 dark:bg-violet-950/30";
          return (
            <li
              key={`${d.employeeId}-${d.kind}-${i}`}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  tone
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
                  {d.employeeName} — {d.label}
                </p>
                <p className="text-[11.5px] text-muted-foreground">
                  {formatDate(d.dueDate)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  d.level === "overdue"
                    ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    : d.level === "soon"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                )}
              >
                {whenLabel(d.daysUntil)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
