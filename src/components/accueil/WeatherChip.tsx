"use client";

import { useEffect, useState } from "react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from "lucide-react";
import type { PharmacyWeather, WeatherCondition } from "@/lib/weather";
import { cn } from "@/lib/utils";

const ICONS: Record<WeatherCondition, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
};

const TONE: Record<WeatherCondition, string> = {
  clear: "text-amber-500",
  partly: "text-amber-400",
  cloudy: "text-slate-400",
  fog: "text-slate-400",
  drizzle: "text-sky-500",
  rain: "text-sky-500",
  snow: "text-sky-300",
  thunder: "text-violet-500",
};

/**
 * Petite pastille météo de l'officine, affichée dans l'en-tête de l'accueil.
 * Autonome : fetch /api/weather ; se cache si adresse absente ou API KO.
 */
export function WeatherChip({ className }: { className?: string }) {
  const [w, setW] = useState<PharmacyWeather | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/weather")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.weather) setW(d.weather as PharmacyWeather);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!w) return null;
  const Icon = ICONS[w.condition] ?? Cloud;

  return (
    <div
      title={`${w.label}${w.city ? " · " + w.city : ""} — ${w.tempMin}° / ${w.tempMax}°`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5",
        className
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", TONE[w.condition])} />
      <span className="text-[13px] font-semibold tabular-nums text-foreground">{w.temp}°</span>
      {w.city && (
        <span className="hidden truncate text-[12px] text-muted-foreground sm:inline max-w-[9rem]">
          {w.city}
        </span>
      )}
      <span className="text-[11px] tabular-nums text-muted-foreground/70">
        {w.tempMin}° / {w.tempMax}°
      </span>
    </div>
  );
}
