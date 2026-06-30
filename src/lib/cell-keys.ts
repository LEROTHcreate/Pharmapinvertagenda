/**
 * Clé canonique d'une cellule du planning — source UNIQUE de vérité.
 *
 * Format : "employeeId|date|timeSlot" (date = ISO YYYY-MM-DD, timeSlot = "HH:MM").
 * Auparavant ces helpers étaient dupliqués dans PlanningView, PlanningGrid et
 * planning-store (risque de divergence). Tout passe désormais par ici.
 */

export type CellKey = string;

export type CellRef = {
  employeeId: string;
  date: string;
  timeSlot: string;
};

/** Alias historique : forme parsée d'une CellKey (identique à CellRef). */
export type ParsedCell = CellRef;

/** Construit une CellKey à partir des 3 composantes. */
export function makeCellKey(
  employeeId: string,
  date: string,
  timeSlot: string
): CellKey {
  return `${employeeId}|${date}|${timeSlot}`;
}

/** Construit une CellKey à partir d'un objet { employeeId, date, timeSlot }. */
export function entryKey(e: CellRef): CellKey {
  return makeCellKey(e.employeeId, e.date, e.timeSlot);
}

/** Décompose une CellKey en ses 3 composantes. */
export function parseCellKey(k: CellKey): ParsedCell {
  const [employeeId, date, timeSlot] = k.split("|");
  return { employeeId, date, timeSlot };
}
