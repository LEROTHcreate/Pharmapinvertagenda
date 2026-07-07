import Link from "next/link";
import {
  CalendarOff,
  UserPlus,
  Repeat,
  ClipboardList,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Carte « À traiter » (responsables) — regroupe les files d'attente à valider :
 * demandes d'absence, inscriptions, échanges de créneaux. Chaque ligne pointe
 * vers la page concernée. État calme « tout est à jour » quand rien n'attend.
 *
 * `hideWhenEmpty` : sur mobile on masque la carte quand il n'y a rien (gain de
 * place) ; sur desktop on la garde (état rassurant).
 */
export function ActionsCard({
  pendingAbsences,
  pendingUsers,
  pendingSwaps,
  hideWhenEmpty = false,
}: {
  pendingAbsences: number;
  pendingUsers: number;
  pendingSwaps: number;
  hideWhenEmpty?: boolean;
}) {
  const items = [
    pendingAbsences > 0 && {
      href: "/absences",
      icon: CalendarOff,
      tone: "amber" as const,
      label: `${pendingAbsences} absence${pendingAbsences > 1 ? "s" : ""} à valider`,
    },
    pendingUsers > 0 && {
      href: "/utilisateurs",
      icon: UserPlus,
      tone: "violet" as const,
      label: `${pendingUsers} demande${pendingUsers > 1 ? "s" : ""} d'inscription`,
    },
    pendingSwaps > 0 && {
      href: "/messages",
      icon: Repeat,
      tone: "blue" as const,
      label: `${pendingSwaps} échange${pendingSwaps > 1 ? "s" : ""} à valider`,
    },
  ].filter(Boolean) as {
    href: string;
    icon: typeof CalendarOff;
    tone: "amber" | "violet" | "blue";
    label: string;
  }[];

  const total = items.length;

  if (total === 0) {
    if (hideWhenEmpty) return null;
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[13.5px] font-semibold text-foreground">Tout est à jour</p>
          <p className="text-[12px] text-muted-foreground">
            Aucune validation en attente.
          </p>
        </div>
      </div>
    );
  }

  const toneBox: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
  };

  return (
    <div className="rounded-2xl border border-amber-300/70 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-amber-800/60">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
          <ClipboardList className="h-4 w-4" />
        </span>
        <h2 className="text-[13.5px] font-semibold tracking-tight text-foreground">
          À traiter
        </h2>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          {total}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className="group flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneBox[it.tone])}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-[13.5px] font-medium text-foreground">
                {it.label}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
