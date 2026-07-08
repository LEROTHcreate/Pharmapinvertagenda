/**
 * Horaires d'ouverture de l'officine — types + helpers PURS (aucune dépendance
 * serveur/crypto → importable aussi bien côté client que serveur).
 *
 * Stockés dans `Pharmacy.openingHours` sous forme d'une chaîne JSON : un tableau
 * de 7 jours (Lundi→Dimanche), chaque jour = liste de créneaux {open, close}
 * (permet la coupure méridienne, ex. 08:30–12:30 puis 14:00–19:30).
 */

export type HourRange = { open: string; close: string }; // "HH:MM" (24 h)
export type WeekHours = HourRange[][]; // longueur 7 : [Lundi … Dimanche]

export const WEEKDAY_LABELS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

export function emptyWeekHours(): WeekHours {
  return [[], [], [], [], [], [], []];
}

function isHHMM(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Parse tolérant : nettoie les créneaux invalides, garantit 7 jours. */
export function parseWeekHours(json: string | null | undefined): WeekHours {
  if (!json) return emptyWeekHours();
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length !== 7) return emptyWeekHours();
    return parsed.map((day) =>
      Array.isArray(day)
        ? day
            .filter(
              (r) => r && isHHMM(r.open) && isHHMM(r.close) && r.open < r.close
            )
            .map((r) => ({ open: r.open as string, close: r.close as string }))
        : []
    ) as WeekHours;
  } catch {
    return emptyWeekHours();
  }
}

export function serializeWeekHours(w: WeekHours): string {
  return JSON.stringify(w);
}

export function hasAnyHours(w: WeekHours): boolean {
  return w.some((d) => d.length > 0);
}

/** Index 0=Lundi … 6=Dimanche pour une Date (getDay : 0=dim … 6=sam). */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type OpenState = {
  open: boolean;
  /** Prochaine bascule "HH:MM" du jour, si connue. */
  nextChange: string | null;
  nextKind: "opens" | "closes" | null;
  todayRanges: HourRange[];
};

/**
 * Ouvert / fermé à l'instant `now` (interprété en heure LOCALE de la Date).
 * À exécuter côté client (fuseau du navigateur = fuseau de l'officine).
 */
export function openStateAt(w: WeekHours, now: Date): OpenState {
  const ranges = [...(w[weekdayIndex(now)] ?? [])].sort(
    (a, b) => toMin(a.open) - toMin(b.open)
  );
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const r of ranges) {
    const o = toMin(r.open);
    const c = toMin(r.close);
    if (cur < o)
      return { open: false, nextChange: r.open, nextKind: "opens", todayRanges: ranges };
    if (cur >= o && cur < c)
      return { open: true, nextChange: r.close, nextKind: "closes", todayRanges: ranges };
  }
  return { open: false, nextChange: null, nextKind: null, todayRanges: ranges };
}

export function formatRange(r: HourRange): string {
  return `${r.open.replace(":", "h")} – ${r.close.replace(":", "h")}`;
}

export function formatDayRanges(ranges: HourRange[]): string {
  if (ranges.length === 0) return "Fermé";
  return ranges.map(formatRange).join(" · ");
}
