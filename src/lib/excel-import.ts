import type { TaskCode, AbsenceCode } from "@prisma/client";
import { TASK_LABELS, ABSENCE_LABELS } from "@/types";

/**
 * Import « colle ton Excel » — transforme un tableau collé (une journée) en
 * entrées de gabarit. Tolérant : mappe les libellés de postes (Cptoir, Para,
 * Comde…) et d'absences vers les codes, retrouve les collaborateurs par leur
 * prénom/nom, normalise les horaires ("8:00", "8h", "08:00"). Pur & testable.
 *
 * Format attendu du collage (copié depuis Excel, séparateur TAB) :
 *   - 1re ligne  = en-tête : [Heure] puis les PRÉNOMS des collaborateurs ;
 *   - lignes suivantes = [créneau] puis le poste de chacun sur ce créneau.
 */

export type ImportEmployee = { id: string; firstName: string; lastName: string };

export type ImportEntry = {
  employeeId: string;
  dayOfWeek: number; // 0 = Lundi … 5 = Samedi
  timeSlot: string;
  type: "TASK" | "ABSENCE";
  taskCode: TaskCode | null;
  absenceCode: AbsenceCode | null;
};

export type ParseResult = {
  entries: ImportEntry[];
  warnings: string[];
  /** Prénoms d'en-tête reconnus dans l'équipe. */
  matchedNames: string[];
  /** Prénoms d'en-tête NON reconnus (colonnes ignorées). */
  unmatchedNames: string[];
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Table libellé normalisé → code (postes), construite depuis TASK_LABELS +
// synonymes courants d'officine.
const TASK_MAP: Record<string, TaskCode> = {};
for (const [code, label] of Object.entries(TASK_LABELS)) {
  TASK_MAP[norm(label)] = code as TaskCode;
}
Object.assign(TASK_MAP, {
  comptoir: "COMPTOIR",
  cptoir: "COMPTOIR",
  cpt: "COMPTOIR",
  commande: "COMMANDE",
  comde: "COMMANDE",
  cmd: "COMMANDE",
  para: "PARAPHARMACIE",
  parapharmacie: "PARAPHARMACIE",
  secretariat: "SECRETARIAT",
  secret: "SECRETARIAT",
  miseaprix: "MISE_A_PRIX",
  map: "MISE_A_PRIX",
  robot: "ROBOT",
  livraison: "LIVRAISON",
  livrais: "LIVRAISON",
  liv: "LIVRAISON",
  miseenrayon: "MISE_EN_RAYON",
  rayon: "MISE_EN_RAYON",
  verificationstocks: "VERIFICATION_STOCKS",
  stocks: "VERIFICATION_STOCKS",
  reunionfournisseur: "REUNION_FOURNISSEUR",
  reunf: "REUNION_FOURNISSEUR",
  formation: "FORMATION",
  form: "FORMATION",
  heuressup: "HEURES_SUP",
  hsup: "HEURES_SUP",
  hs: "HEURES_SUP",
  remplacement: "REMPLACEMENT",
  rempl: "REMPLACEMENT",
  echange: "ECHANGE",
  echge: "ECHANGE",
} satisfies Record<string, TaskCode>);

const ABS_MAP: Record<string, AbsenceCode> = {};
for (const [code, label] of Object.entries(ABSENCE_LABELS)) {
  ABS_MAP[norm(label)] = code as AbsenceCode;
}
Object.assign(ABS_MAP, {
  conge: "CONGE",
  conges: "CONGE",
  cp: "CONGE",
  maladie: "MALADIE",
  mal: "MALADIE",
  absent: "ABSENT",
  abs: "ABSENT",
  formationexterne: "FORMATION_ABS",
  formationabs: "FORMATION_ABS",
  formext: "FORMATION_ABS",
} satisfies Record<string, AbsenceCode>);

/** "8:00" / "8h" / "08h00" / "8" → "HH:MM" si c'est un créneau valide, sinon null. */
function normSlot(raw: string, timeSlots: string[]): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[h:.]?\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  const s = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return timeSlots.includes(s) ? s : null;
}

export function parsePastedDay(input: {
  text: string;
  dayOfWeek: number;
  employees: ImportEmployee[];
  timeSlots: string[];
}): ParseResult {
  const { text, dayOfWeek, employees, timeSlots } = input;
  const warnings: string[] = [];
  const entries: ImportEntry[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { entries: [], warnings: ["Colle au moins la ligne des prénoms + une ligne d'horaires."], matchedNames: [], unmatchedNames: [] };
  }

  // ─── En-tête : associe chaque colonne (dès la 2e) à un collaborateur ───
  const header = lines[0].split("\t");
  const matchedNames: string[] = [];
  const unmatchedNames: string[] = [];
  // colonne d'index c (≥1) → employeeId | null
  const colEmp: (string | null)[] = header.map((raw, c) => {
    if (c === 0) return null; // 1re colonne = horaires
    const h = norm(raw);
    if (!h) return null;
    const emp = employees.find((e) => {
      const f = norm(e.firstName);
      const l = norm(e.lastName);
      return h === f || h === l || h === norm(`${e.firstName} ${e.lastName}`) || (f.length >= 3 && h.startsWith(f));
    });
    if (emp) {
      matchedNames.push(raw.trim());
      return emp.id;
    }
    unmatchedNames.push(raw.trim());
    return null;
  });

  // dédup (dernier gagne) sur (emp|slot)
  const seen = new Map<string, ImportEntry>();

  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split("\t");
    const slot = normSlot(cells[0] ?? "", timeSlots);
    if (!slot) continue; // ligne sans créneau reconnu → ignorée
    for (let c = 1; c < cells.length; c++) {
      const empId = colEmp[c];
      if (!empId) continue;
      const raw = (cells[c] ?? "").trim();
      if (!raw) continue;
      const key = norm(raw);
      const task = TASK_MAP[key];
      const abs = ABS_MAP[key];
      if (!task && !abs) {
        warnings.push(`Poste « ${raw} » non reconnu (ignoré) — créneau ${slot}.`);
        continue;
      }
      const entry: ImportEntry = task
        ? { employeeId: empId, dayOfWeek, timeSlot: slot, type: "TASK", taskCode: task, absenceCode: null }
        : { employeeId: empId, dayOfWeek, timeSlot: slot, type: "ABSENCE", taskCode: null, absenceCode: abs };
      seen.set(`${empId}|${slot}`, entry);
    }
  }

  entries.push(...seen.values());
  // Dédoublonne les warnings (mêmes libellés inconnus répétés).
  const uniqWarnings = Array.from(new Set(warnings)).slice(0, 12);
  return { entries, warnings: uniqWarnings, matchedNames, unmatchedNames: Array.from(new Set(unmatchedNames)) };
}
