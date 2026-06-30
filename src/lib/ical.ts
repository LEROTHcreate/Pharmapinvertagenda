/**
 * Génération d'un flux iCalendar (RFC 5545) du planning personnel — permet à
 * un salarié de s'abonner à ses créneaux depuis Google/Apple Calendar via une
 * URL privée (jeton non devinable).
 *
 * Pures fonctions (testables). Les heures sont émises en "heure locale
 * flottante" (sans Z ni TZID) : la plupart des agendas les affichent à
 * l'heure indiquée, ce qui convient pour une officine en France.
 */

export type IcalShift = {
  /** Jour ISO YYYY-MM-DD */
  date: string;
  /** Début "HH:MM" (inclus) */
  start: string;
  /** Fin "HH:MM" (exclu) */
  end: string;
};

type Entry = { date: string; timeSlot: string; type: string };

const SLOT_MINUTES = 30;

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Convertit les créneaux TASK en blocs continus (un VEVENT par bloc).
 * Fusionne les créneaux 30 min adjacents d'un même jour.
 */
export function entriesToShifts(entries: Entry[]): IcalShift[] {
  const byDate = new Map<string, string[]>();
  for (const e of entries) {
    if (e.type !== "TASK") continue;
    const arr = byDate.get(e.date) ?? [];
    arr.push(e.timeSlot);
    byDate.set(e.date, arr);
  }

  const shifts: IcalShift[] = [];
  for (const date of Array.from(byDate.keys()).sort()) {
    const slots = Array.from(new Set(byDate.get(date)!)).sort();
    let blockStart: string | null = null;
    let prev: string | null = null;
    for (const slot of slots) {
      if (blockStart === null) {
        blockStart = slot;
      } else if (prev !== null && addMinutes(prev, SLOT_MINUTES) !== slot) {
        // Rupture de continuité → on ferme le bloc précédent.
        shifts.push({ date, start: blockStart, end: addMinutes(prev, SLOT_MINUTES) });
        blockStart = slot;
      }
      prev = slot;
    }
    if (blockStart !== null && prev !== null) {
      shifts.push({ date, start: blockStart, end: addMinutes(prev, SLOT_MINUTES) });
    }
  }
  return shifts;
}

function icsDateTime(dateIso: string, hhmm: string): string {
  return `${dateIso.replace(/-/g, "")}T${hhmm.replace(":", "")}00`;
}

/** Échappe les caractères spéciaux iCal dans un texte (RFC 5545 §3.3.11). */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Construit le contenu .ics complet. `stamp` = DTSTAMP (YYYYMMDDTHHMMSSZ). */
export function buildICalendar(opts: {
  calName: string;
  location: string;
  shifts: IcalShift[];
  stamp: string;
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PharmaPlanning//Planning//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.calName)}`,
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const s of opts.shifts) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.date}-${s.start.replace(":", "")}@pharmaplanning`,
      `DTSTAMP:${opts.stamp}`,
      `DTSTART:${icsDateTime(s.date, s.start)}`,
      `DTEND:${icsDateTime(s.date, s.end)}`,
      `SUMMARY:${esc(opts.calName)}`,
      `LOCATION:${esc(opts.location)}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 : lignes séparées par CRLF.
  return lines.join("\r\n") + "\r\n";
}
