"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Tuile KPI « en poste en ce moment » pour le tableau de bord desktop.
 * Même logique que TeamNowCard (décompte du créneau en cours à l'heure locale,
 * rafraîchi chaque minute), mais présentée en grand chiffre pour un dashboard.
 */
export function TeamNowStat({
  presentBySlot,
  dayTotal,
}: {
  presentBySlot: Record<string, number>;
  dayTotal: number;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const slot = now
    ? `${String(now.getHours()).padStart(2, "0")}:${
        now.getMinutes() < 30 ? "00" : "30"
      }`
    : null;
  const count = slot ? presentBySlot[slot] ?? 0 : null;

  return (
    <Link
      href="/planning"
      className="group rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-emerald-300 dark:hover:border-emerald-800"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">
          En poste maintenant
        </span>
        <span className="relative flex h-2.5 w-2.5">
          {count !== null && count > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={
              "relative inline-flex h-2.5 w-2.5 rounded-full " +
              (count !== null && count > 0 ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600")
            }
          />
        </span>
      </div>
      <div className="mt-1.5 font-mono text-[30px] font-semibold tabular-nums leading-none text-foreground">
        {count === null ? dayTotal : count}
      </div>
      <div className="mt-1 text-[11.5px] text-muted-foreground">
        {count === null
          ? `${dayTotal} au travail aujourd'hui`
          : count > 0
            ? `sur ${dayTotal} au travail aujourd'hui`
            : `personne · ${dayTotal} au travail aujourd'hui`}
      </div>
    </Link>
  );
}