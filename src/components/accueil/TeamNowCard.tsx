"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";

/**
 * Carte « équipe » de l'accueil : met en avant le nombre de personnes EN POSTE
 * À L'INSTANT (créneau en cours), et non le total de la journée.
 *
 * Le décompte se fait côté client à partir de l'heure LOCALE de l'appareil
 * (= heure de l'officine), pour éviter tout décalage de fuseau serveur (Vercel
 * tourne en UTC). Rafraîchi chaque minute. Le total du jour reste affiché en
 * information secondaire.
 */
export function TeamNowCard({
  presentBySlot,
  dayTotal,
}: {
  /** Nombre d'employés en TÂCHE par créneau "HH:MM". */
  presentBySlot: Record<string, number>;
  /** Total distinct d'employés au travail sur la journée. */
  dayTotal: number;
}) {
  // `null` tant que le composant n'est pas monté → évite un écart d'hydratation
  // (l'heure du serveur n'est pas celle du client).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const currentSlot = now
    ? `${String(now.getHours()).padStart(2, "0")}:${
        now.getMinutes() < 30 ? "00" : "30"
      }`
    : null;
  const nowCount = currentSlot ? presentBySlot[currentSlot] ?? 0 : null;

  return (
    <Link
      href="/planning"
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-[0.99] transition-transform"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/40">
        <Users className="h-5 w-5 text-violet-600 dark:text-violet-300" />
      </div>
      <div className="min-w-0 flex-1">
        {nowCount === null ? (
          // Avant montage : rendu serveur stable = total de la journée.
          <p className="text-[14px] font-semibold text-foreground">
            <span className="tabular-nums">{dayTotal}</span> au travail aujourd&apos;hui
          </p>
        ) : nowCount > 0 ? (
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>
              <span className="tabular-nums">{nowCount}</span> en poste en ce moment
            </span>
          </p>
        ) : (
          <p className="text-[14px] font-semibold text-foreground">
            Personne en poste actuellement
          </p>
        )}
        <p className="text-[12px] text-muted-foreground">
          {nowCount === null
            ? "Voir le planning de l'équipe"
            : `${dayTotal} au travail aujourd'hui · voir le planning`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </Link>
  );
}
