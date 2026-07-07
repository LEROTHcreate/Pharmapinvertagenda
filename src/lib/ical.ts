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
  /** Nature du bloc — sert à titrer/UID (travail vs absence). */
  type: "TASK" | "ABSENCE";
  /** Code d'absence si type = ABSENCE (Congé, Maladie…), sinon null. */
  absenceCode: string | null;
};

type Entry = {
  date: string;
  timeSlot: string;
  type: string;
  absenceCode?: string | null;
};

const SLOT_MINUTES = 30;

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Clé de « même nature » pour décider si deux créneaux fusionnent. */
function kindKey(type: string, absenceCode: string | null | undefined): string {
  return type === "ABSENCE" ? `A:${absenceCode ?? ""}` : "T";
}

/**
 * Convertit les créneaux en blocs continus (un VEVENT par bloc). Fusionne les
 * créneaux 30 min adjacents d'un même jour ET de même nature (même poste, ou
 * même type d'absence). Par défaut : uniquement le travail (TASK). Passer
 * `includeAbsences` pour émettre aussi les congés / maladies / formations.
 */
export function entriesToShifts(
  entries: Entry[],
  includeAbsences = false
): IcalShift[] {
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    const keep = e.type === "TASK" || (includeAbsences && e.type === "ABSENCE");
    if (!keep) continue;
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }

  const shifts: IcalShift[] = [];
  for (const date of Array.from(byDate.keys()).sort()) {
    // Tri par heure + dédup d'un même créneau (garde le premier).
    const seen = new Set<string>();
    const slots = byDate
      .get(date)!
      .slice()
      .sort((a, b) => (a.timeSlot < b.timeSlot ? -1 : a.timeSlot > b.timeSlot ? 1 : 0))
      .filter((s) => (seen.has(s.timeSlot) ? false : (seen.add(s.timeSlot), true)));

    let cur:
      | { start: string; prev: string; type: string; absenceCode: string | null }
      | null = null;

    for (const s of slots) {
      const contiguous =
        cur !== null &&
        addMinutes(cur.prev, SLOT_MINUTES) === s.timeSlot &&
        kindKey(cur.type, cur.absenceCode) === kindKey(s.type, s.absenceCode);
      if (cur && !contiguous) {
        shifts.push(closeBlock(date, cur));
        cur = null;
      }
      if (!cur) {
        cur = {
          start: s.timeSlot,
          prev: s.timeSlot,
          type: s.type,
          absenceCode: s.absenceCode ?? null,
        };
      } else {
        cur.prev = s.timeSlot;
      }
    }
    if (cur) shifts.push(closeBlock(date, cur));
  }
  return shifts;
}

function closeBlock(
  date: string,
  cur: { start: string; prev: string; type: string; absenceCode: string | null }
): IcalShift {
  return {
    date,
    start: cur.start,
    end: addMinutes(cur.prev, SLOT_MINUTES),
    type: cur.type === "ABSENCE" ? "ABSENCE" : "TASK",
    absenceCode: cur.type === "ABSENCE" ? cur.absenceCode : null,
  };
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

/**
 * Construit le contenu .ics complet.
 *  - `calName` : nom du calendrier + titre par défaut des créneaux de travail.
 *  - `summaryFor(shift)` : titre d'un événement (permet de nommer les absences).
 *  - `alarmMinutes` : si défini > 0, ajoute un rappel N min avant chaque créneau.
 *  - `stamp` : DTSTAMP (YYYYMMDDTHHMMSSZ).
 */
export function buildICalendar(opts: {
  calName: string;
  location: string;
  shifts: IcalShift[];
  stamp: string;
  summaryFor?: (s: IcalShift) => string;
  alarmMinutes?: number;
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
    const summary = opts.summaryFor ? opts.summaryFor(s) : opts.calName;
    const kind = s.type === "ABSENCE" ? `abs-${s.absenceCode ?? ""}` : "task";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.date}-${s.start.replace(":", "")}-${kind}@pharmaplanning`,
      `DTSTAMP:${opts.stamp}`,
      `DTSTART:${icsDateTime(s.date, s.start)}`,
      `DTEND:${icsDateTime(s.date, s.end)}`,
      `SUMMARY:${esc(summary)}`,
      `LOCATION:${esc(opts.location)}`
    );
    if (opts.alarmMinutes && opts.alarmMinutes > 0) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${esc(summary)}`,
        `TRIGGER:-PT${Math.round(opts.alarmMinutes)}M`,
        "END:VALARM"
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 : lignes séparées par CRLF.
  return lines.join("\r\n") + "\r\n";
}
