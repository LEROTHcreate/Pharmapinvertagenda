"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Clock,
  ShieldPlus,
  Phone,
  MapPin,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import type { PharmacyWeather, WeatherCondition } from "@/lib/weather";
import {
  WEEKDAY_LABELS,
  formatDayRanges,
  hasAnyHours,
  openStateAt,
  weekdayIndex,
  type WeekHours,
} from "@/lib/opening-hours";

const WEATHER_ICONS: Record<WeatherCondition, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
};

type GardeInfo = { name: string; typeLabel: string; dateIso: string };

/** Conseils santé neutres, en rotation en bas de l'écran (aucune reco médicale
 *  ciblée — messages de prévention grand public). */
const HEALTH_TIPS = [
  "Pensez à bien vous hydrater tout au long de la journée.",
  "Un doute sur un médicament ? Demandez conseil à votre pharmacien.",
  "Signalez toujours vos traitements en cours avant une automédication.",
  "Rapportez vos médicaments non utilisés à la pharmacie (Cyclamed).",
  "Conservez vos médicaments à l'abri de la chaleur et de l'humidité.",
  "Ordonnance à renouveler ? Anticipez pour éviter la rupture.",
  "Vaccination : parlez-en à l'équipe de la pharmacie.",
];

/**
 * Écran vitrine / salle d'attente — plein écran, sombre, gros caractères, pour
 * un second écran (TV / tablette) de l'officine. Affiche l'horloge + la météo,
 * les horaires (ouvert/fermé maintenant), la pharmacie de garde et le message
 * du jour. Se rafraîchit tout seul (horloge à la seconde, données au serveur
 * toutes les 5 min).
 */
export function VitrineScreen({
  pharmacyName,
  logoUrl,
  address,
  phone,
  notice,
  weekHours,
  garde,
  weather,
}: {
  pharmacyName: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  notice: string | null;
  weekHours: WeekHours;
  garde: GardeInfo | null;
  weather: PharmacyWeather | null;
}) {
  const router = useRouter();
  // Horloge : null au premier rendu (évite un décalage d'hydratation), fixée
  // côté client puis mise à jour à la seconde.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Rafraîchit les données serveur (garde, message, horaires) toutes les 5 min.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [router]);

  // Conseil santé en rotation (change toutes les 8 s, avec fondu).
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setTipIdx((i) => (i + 1) % HEALTH_TIPS.length),
      8000
    );
    return () => clearInterval(t);
  }, []);

  // QR « nous trouver » → itinéraire Google Maps vers l'officine (image générée
  // par un service externe ; masquée en cas d'échec de chargement).
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address ? `${pharmacyName} ${address}` : pharmacyName
  )}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(
    mapsUrl
  )}`;

  const openState = useMemo(
    () => (now ? openStateAt(weekHours, now) : null),
    [weekHours, now]
  );

  const todayIdx = now ? weekdayIndex(now) : -1;
  const showHours = hasAnyHours(weekHours);

  return (
    <div className="min-h-screen w-full bg-[#0b1020] text-white [font-feature-settings:'tnum']">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 p-6 md:p-10">
        {/* ─── En-tête : identité + horloge + météo ─── */}
        <header className="flex items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-white/15 md:h-20 md:w-20"
              />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30 md:h-20 md:w-20">
                <ShieldPlus className="h-8 w-8" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-bold tracking-tight md:text-5xl">
                {pharmacyName}
              </h1>
              {address && (
                <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-white/60 md:text-base">
                  <MapPin className="h-4 w-4 shrink-0" /> {address}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <ClockDisplay now={now} />
            {weather && <WeatherBadge weather={weather} />}
          </div>
        </header>

        {/* ─── Bandeau ouvert / fermé ─── */}
        {showHours && openState && (
          <div
            className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-6 py-4 text-lg font-semibold ring-1 md:text-2xl ${
              openState.open
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                : "bg-rose-500/15 text-rose-300 ring-rose-400/30"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-3 w-3 rounded-full ${
                  openState.open ? "bg-emerald-400" : "bg-rose-400"
                } animate-pulse`}
              />
              {openState.open ? "Ouvert" : "Fermé"}
            </span>
            {openState.nextChange && (
              <span className="text-base font-normal text-white/70 md:text-xl">
                {openState.open
                  ? `Ferme à ${openState.nextChange.replace(":", "h")}`
                  : `Ouvre à ${openState.nextChange.replace(":", "h")}`}
              </span>
            )}
          </div>
        )}

        {/* ─── Corps : garde + horaires / message ─── */}
        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Pharmacie de garde */}
          <Panel
            title="Pharmacie de garde"
            icon={<ShieldPlus className="h-6 w-6" />}
            accent="text-violet-300"
          >
            {garde ? (
              <div className="space-y-2">
                <p className="text-2xl font-bold md:text-3xl">{garde.name}</p>
                <p className="text-lg capitalize text-white/70 md:text-xl">
                  {formatGardeDate(garde.dateIso)}
                </p>
                <span className="inline-block rounded-full bg-violet-500/20 px-3 py-1 text-sm font-medium text-violet-200 ring-1 ring-violet-400/30">
                  {garde.typeLabel}
                </span>
              </div>
            ) : (
              <p className="text-lg text-white/50">Aucune garde programmée.</p>
            )}
          </Panel>

          {/* Horaires de la semaine */}
          <Panel
            title="Horaires d'ouverture"
            icon={<Clock className="h-6 w-6" />}
            accent="text-sky-300"
          >
            {showHours ? (
              <ul className="space-y-1.5">
                {WEEKDAY_LABELS.map((label, i) => {
                  const isToday = i === todayIdx;
                  return (
                    <li
                      key={label}
                      className={`flex items-baseline justify-between gap-3 rounded-lg px-2 py-1 ${
                        isToday ? "bg-white/10 font-semibold" : ""
                      }`}
                    >
                      <span className={isToday ? "text-white" : "text-white/70"}>
                        {label}
                      </span>
                      <span
                        className={`text-right tabular-nums ${
                          weekHours[i].length === 0
                            ? "text-white/35"
                            : "text-white/90"
                        }`}
                      >
                        {formatDayRanges(weekHours[i])}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-lg text-white/50">
                Horaires à configurer dans les paramètres.
              </p>
            )}
          </Panel>

          {/* Message du jour */}
          <Panel
            title="Message du jour"
            icon={<span className="text-2xl leading-none">💬</span>}
            accent="text-amber-300"
          >
            {notice && notice.trim() ? (
              <p className="text-2xl font-medium leading-snug text-white md:text-3xl">
                {notice}
              </p>
            ) : (
              <p className="text-lg text-white/50">
                Bienvenue à la pharmacie {pharmacyName}.
              </p>
            )}
            {phone && (
              <p className="mt-4 flex items-center gap-2 text-lg text-white/70">
                <Phone className="h-5 w-5" /> {phone}
              </p>
            )}
          </Panel>
        </div>

        {/* ─── Bandeau bas : conseil santé en rotation + QR « nous trouver » ─── */}
        <footer className="flex items-center justify-between gap-6 rounded-3xl bg-white/[0.04] px-6 py-4 ring-1 ring-white/10 md:px-8">
          <style>{`@keyframes vitrineFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.vitrine-fade{animation:vitrineFade .6s ease}`}</style>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/25">
              <Lightbulb className="h-5 w-5" />
            </span>
            <p
              key={tipIdx}
              className="vitrine-fade min-w-0 text-lg text-white/85 md:text-2xl"
            >
              {HEALTH_TIPS[tipIdx]}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Nous trouver
              </p>
              <p className="text-sm text-white/70">Scannez pour l&apos;itinéraire</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR itinéraire vers la pharmacie"
              width={80}
              height={80}
              className="h-16 w-16 rounded-lg bg-white p-1 md:h-20 md:w-20"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ─── Sous-composants ─────────────────────────────────────────────── */

function Panel({
  title,
  icon,
  accent,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-3xl bg-white/[0.04] p-6 ring-1 ring-white/10 md:p-8">
      <h2
        className={`mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] ${accent}`}
      >
        {icon}
        {title}
      </h2>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function ClockDisplay({ now }: { now: Date | null }) {
  if (!now) {
    // Placeholder stable pour l'hydratation (rempli côté client).
    return <div className="h-[3.5rem] w-40" aria-hidden />;
  }
  const time = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div className="text-right">
      <div className="font-mono text-4xl font-bold tabular-nums md:text-6xl">
        {time}
      </div>
      <div className="text-sm capitalize text-white/60 md:text-base">{date}</div>
    </div>
  );
}

function WeatherBadge({ weather }: { weather: PharmacyWeather }) {
  const Icon = WEATHER_ICONS[weather.condition] ?? Cloud;
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-1.5 ring-1 ring-white/10">
      <Icon className="h-5 w-5 text-sky-300" />
      <span className="text-lg font-semibold tabular-nums">{weather.temp}°</span>
      {weather.city && (
        <span className="text-sm text-white/60">{weather.city}</span>
      )}
      <span className="text-xs tabular-nums text-white/45">
        {weather.tempMin}° / {weather.tempMax}°
      </span>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function formatGardeDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
