import Link from "next/link";
import { ShieldPlus, ChevronRight } from "lucide-react";
import type { NextGarde } from "@/components/accueil/types";

/** « Prochaine garde » — pharmacien de garde à venir. Vue serveur. */
export function NextGardeCard({ garde }: { garde: NextGarde }) {
  const when =
    garde.daysUntil <= 0
      ? "aujourd'hui"
      : garde.daysUntil === 1
        ? "demain"
        : `dans ${garde.daysUntil} j`;

  return (
    <Link
      href="/gardes"
      className="group block rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-indigo-300 dark:hover:border-indigo-800"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
          <ShieldPlus className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Prochaine garde
            </p>
            <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
              {garde.typeLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[14px] font-semibold text-foreground">
            {garde.name}
          </p>
          <p className="truncate text-[12px] capitalize text-muted-foreground">
            {garde.dateLabel} · {when}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
      </div>
    </Link>
  );
}
