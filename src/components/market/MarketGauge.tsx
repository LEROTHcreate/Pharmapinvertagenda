import {
  bandForSize,
  classifySector,
  type OfficineSize,
  type SectorKey,
} from "@/lib/sector-benchmark";
import { cn } from "@/lib/utils";

/** Formate une valeur selon l'unité de l'indicateur. */
function fmtValue(value: number, unit: "pct" | "eur"): string {
  if (unit === "pct") return `${(value * 100).toFixed(1).replace(".", ",")} %`;
  if (value >= 1000)
    return `${Math.round(value / 1000).toLocaleString("fr-FR")} k€`;
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

const VERDICT_CHIP: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  normal: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300",
  watch: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
};

/**
 * Jauge de positionnement marché : situe la valeur de l'officine sur une échelle
 * partagée en 3 zones (favorable / normale / à surveiller, selon le sens de
 * l'indicateur) avec un repère « secteur » (médiane) et un curseur « vous ».
 * Composant purement présentationnel (rendu serveur ou client indifféremment).
 */
export function MarketGauge({
  sectorKey,
  value,
  size = null,
  className,
}: {
  sectorKey: SectorKey;
  /** Valeur de l'officine (même unité que le repère). */
  value: number;
  /** Taille d'officine → ajuste le repère à des pharmacies de CA similaire. */
  size?: OfficineSize | null;
  className?: string;
}) {
  const band = bandForSize(sectorKey, size);
  const res = classifySector(value, sectorKey, size);
  const lower = band.direction === "lower-is-better";

  // Échelle : on couvre confortablement la médiane, les seuils et la valeur.
  const max = Math.max(
    band.alertAt,
    band.favorableAt,
    band.median,
    value
  ) * 1.2;
  const p = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;

  // Bornes des zones colorées selon le sens.
  const favEnd = lower ? band.favorableAt : max;
  const favStart = lower ? 0 : band.favorableAt;
  const alertStart = lower ? band.alertAt : 0;
  const alertEnd = lower ? max : band.alertAt;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground/80">
          {band.label}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
            VERDICT_CHIP[res.verdict]
          )}
        >
          {res.label}
        </span>
      </div>

      {/* Piste + zones + repères (ordre DOM = ordre d'empilement) */}
      <div className="relative h-6">
        {/* Base : zone « normale » (ambre) sur toute la largeur */}
        <span className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2 rounded-full bg-amber-100/70 dark:bg-amber-950/40" />
        {/* Zone favorable (verte) */}
        <span
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-emerald-300/80 dark:bg-emerald-800/50"
          style={{ left: p(favStart), width: `calc(${p(favEnd)} - ${p(favStart)})` }}
        />
        {/* Zone d'alerte (rose) */}
        <span
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-rose-300/80 dark:bg-rose-800/50"
          style={{ left: p(alertStart), width: `calc(${p(alertEnd)} - ${p(alertStart)})` }}
        />

        {/* Repère secteur (médiane) */}
        <span
          className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-zinc-500/70"
          style={{ left: p(band.median) }}
          title={`Secteur ≈ ${fmtValue(band.median, band.unit)}`}
        />
        {/* Curseur « vous » */}
        <span
          className={cn(
            "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow dark:border-zinc-900",
            res.verdict === "good"
              ? "bg-emerald-500"
              : res.verdict === "watch"
                ? "bg-rose-500"
                : "bg-amber-500"
          )}
          style={{ left: p(value) }}
          title={`Vous : ${fmtValue(value, band.unit)}`}
        />
      </div>

      {/* Légende chiffrée */}
      <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>
          Vous :{" "}
          <strong className="text-foreground">{fmtValue(value, band.unit)}</strong>
        </span>
        <span>Secteur ≈ {fmtValue(band.median, band.unit)}</span>
      </div>
    </div>
  );
}
