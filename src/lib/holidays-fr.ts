/**
 * Jours fériés en France métropolitaine.
 *
 * On évite une dépendance externe : l'algorithme est simple et stable.
 * Pâques est calculé via la formule de Gauss/Meeus, les autres fériés
 * sont à dates fixes ou dérivés de Pâques.
 */

export type Holiday = {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  /** Affichage compact (max ~12 chars) pour les badges sur la grille */
  short: string;
};

/** Dimanche de Pâques pour une année donnée — méthode de Meeus/Jones/Butcher. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Génère tous les fériés FR métropole d'une année donnée. */
export function getHolidaysFR(year: number): Holiday[] {
  const easter = easterSunday(year);
  const easterMonday = addDays(easter, 1);
  const ascension = addDays(easter, 39); // jeudi de l'Ascension
  const pentecostMonday = addDays(easter, 50); // lundi de Pentecôte

  return [
    { date: `${year}-01-01`, name: "Jour de l'an", short: "Jour de l'an" },
    { date: iso(easterMonday), name: "Lundi de Pâques", short: "L. Pâques" },
    { date: `${year}-05-01`, name: "Fête du travail", short: "1er mai" },
    { date: `${year}-05-08`, name: "Victoire 1945", short: "8 mai" },
    { date: iso(ascension), name: "Ascension", short: "Ascension" },
    { date: iso(pentecostMonday), name: "Lundi de Pentecôte", short: "L. Pentecôte" },
    { date: `${year}-07-14`, name: "Fête nationale", short: "14 juillet" },
    { date: `${year}-08-15`, name: "Assomption", short: "15 août" },
    { date: `${year}-11-01`, name: "Toussaint", short: "Toussaint" },
    { date: `${year}-11-11`, name: "Armistice 1918", short: "11 nov" },
    { date: `${year}-12-25`, name: "Noël", short: "Noël" },
  ];
}

/**
 * Construit un index { "YYYY-MM-DD" → Holiday } pour les années couvrant
 * toutes les dates passées en paramètre. Pré-calcule en cache simple.
 */
const yearCache = new Map<number, Holiday[]>();

function getYear(year: number): Holiday[] {
  let cached = yearCache.get(year);
  if (!cached) {
    cached = getHolidaysFR(year);
    yearCache.set(year, cached);
  }
  return cached;
}

/** Retourne le férié pour une date "YYYY-MM-DD" ou null. */
export function holidayForDate(isoDate: string): Holiday | null {
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  const list = getYear(year);
  return list.find((h) => h.date === isoDate) ?? null;
}

/** Index pour un range de dates — pratique pour la grille semaine/mois. */
export function holidaysIndexForDates(dates: string[]): Map<string, Holiday> {
  const years = new Set(dates.map((d) => Number(d.slice(0, 4))));
  const map = new Map<string, Holiday>();
  for (const y of years) {
    if (!Number.isFinite(y)) continue;
    for (const h of getYear(y)) map.set(h.date, h);
  }
  // Restreint aux dates demandées
  const filtered = new Map<string, Holiday>();
  for (const d of dates) {
    const h = map.get(d);
    if (h) filtered.set(d, h);
  }
  return filtered;
}
