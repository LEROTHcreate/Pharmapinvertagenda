import { cn } from "@/lib/utils";

const fmtH = (h: number) => (h % 1 === 0 ? String(h) : h.toFixed(1));

/**
 * Carte "Ma semaine" de l'Accueil : heures comptabilisées cette semaine vs
 * contrat, avec barre de progression et écart (heures sup / restant).
 */
export function MyWeekCard({
  done,
  contract,
}: {
  done: number;
  contract: number;
}) {
  const pct = contract > 0 ? Math.min(100, (done / contract) * 100) : 0;
  const delta = done - contract;
  const over = delta >= 0.5;
  const remaining = -delta;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[13px] uppercase tracking-[0.06em] font-semibold text-muted-foreground/70">
          Ma semaine
        </h2>
        <span className="font-mono text-[13px] tabular-nums text-foreground">
          <span className="font-bold">{fmtH(done)}</span>
          <span className="text-muted-foreground/60"> / {fmtH(contract)}h</span>
        </span>
      </div>

      {/* Barre de progression */}
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-rose-500" : "bg-violet-500"
          )}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>

      <p className="mt-2 text-[12px]">
        {over ? (
          <span className="font-medium text-rose-600 dark:text-rose-400">
            +{fmtH(delta)}h au-dessus du contrat
          </span>
        ) : remaining >= 0.5 ? (
          <span className="text-muted-foreground">
            Encore <span className="font-medium text-foreground">{fmtH(remaining)}h</span> avant le contrat
          </span>
        ) : (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            Contrat atteint 👍
          </span>
        )}
      </p>
    </div>
  );
}
