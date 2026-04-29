import type { EmployeeDTO } from "@/types";
import type { EmployeeDayMap } from "@/lib/planning-utils";

export type CoverageWarning =
  | {
      kind: "no-pharmacist";
      date: string;
      slots: string[]; // créneaux concernés
    }
  | {
      kind: "few-preparers";
      date: string;
      slots: string[];
      minCount: number; // effectif minimum constaté
    }
  | {
      kind: "livreur-absent";
      date: string;
      employeeName: string; // ex: "Patrick"
    };

/**
 * Analyse la couverture d'une période et remonte les manquements aux règles :
 *  - Toujours ≥ 1 pharmacien présent (TASK) sur les créneaux ouverts
 *  - Toujours ≥ 2 préparateurs présents (TASK) sur les créneaux ouverts
 *  - Si le livreur est absent un jour, signale qu'il faut faire les livraisons
 */
export function analyzeCoverage(
  employees: EmployeeDTO[],
  dates: string[],
  index: Map<string, EmployeeDayMap>,
  /** Créneaux à considérer comme "ouverts" — typiquement 08:30 → 19:00 */
  workingSlots: string[]
): CoverageWarning[] {
  const warnings: CoverageWarning[] = [];

  const pharmacists = employees.filter((e) => e.status === "PHARMACIEN");
  const preparers = employees.filter((e) => e.status === "PREPARATEUR");
  const livreurs = employees.filter((e) => e.status === "LIVREUR");

  for (const date of dates) {
    // ─── Vérification livreur ───
    for (const liv of livreurs) {
      const day = index.get(liv.id)?.get(date);
      const hasAbsence = day
        ? Array.from(day.values()).some((e) => e.type === "ABSENCE")
        : false;
      const hasTask = day
        ? Array.from(day.values()).some((e) => e.type === "TASK")
        : false;
      // Considéré comme "absent ce jour" : marqué absent ET aucune tâche planifiée
      if (hasAbsence && !hasTask) {
        warnings.push({
          kind: "livreur-absent",
          date,
          employeeName: liv.firstName,
        });
      }
    }

    // ─── Vérification pharmacien (≥ 1 sur chaque créneau ouvert) ───
    const noPharmSlots: string[] = [];
    for (const slot of workingSlots) {
      let active = 0;
      for (const ph of pharmacists) {
        const e = index.get(ph.id)?.get(date)?.get(slot);
        if (e && e.type === "TASK") active++;
      }
      if (active === 0) noPharmSlots.push(slot);
    }
    if (noPharmSlots.length > 0) {
      warnings.push({
        kind: "no-pharmacist",
        date,
        slots: compactSlotRanges(noPharmSlots),
      });
    }

    // ─── Vérification préparateurs (≥ 2 sur chaque créneau ouvert) ───
    const fewPrepSlots: string[] = [];
    let dayMin = Infinity;
    for (const slot of workingSlots) {
      let active = 0;
      for (const pr of preparers) {
        const e = index.get(pr.id)?.get(date)?.get(slot);
        if (e && e.type === "TASK") active++;
      }
      if (active < 2) {
        fewPrepSlots.push(slot);
        if (active < dayMin) dayMin = active;
      }
    }
    if (fewPrepSlots.length > 0) {
      warnings.push({
        kind: "few-preparers",
        date,
        slots: compactSlotRanges(fewPrepSlots),
        minCount: isFinite(dayMin) ? dayMin : 0,
      });
    }
  }

  return warnings;
}

/**
 * Compacte une liste de créneaux ("HH:MM") en plages contiguës ("HH:MM-HH:MM").
 * Ex: ["09:00", "09:30", "10:00", "14:00"] → ["09:00-10:30", "14:00-14:30"]
 */
function compactSlotRanges(slots: string[]): string[] {
  if (slots.length === 0) return [];
  const sorted = [...slots].sort();
  const out: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  const add30 = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    const total = h * 60 + m + 30;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === add30(prev)) {
      prev = sorted[i];
      continue;
    }
    out.push(`${start}-${add30(prev)}`);
    start = sorted[i];
    prev = sorted[i];
  }
  out.push(`${start}-${add30(prev)}`);
  return out;
}
