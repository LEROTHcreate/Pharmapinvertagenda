import type { AbsenceCode } from "@prisma/client";

/**
 * Impact des absences sur la paie — pont Absences ↔ Rémunération.
 *
 * Chaque code d'absence a un traitement de paie distinct, conforme au
 * fonctionnement d'une officine (CCN pharmacie / droit du travail) :
 *  - CONGE (congé payé)      → RÉMUNÉRÉ (maintien de salaire), décompté du solde CP.
 *  - FORMATION_ABS           → RÉMUNÉRÉ (temps de travail assimilé).
 *  - MALADIE (arrêt maladie) → INDEMNISÉ (IJSS + maintien employeur selon
 *                              ancienneté ; carence légale de 3 jours).
 *  - ABSENT (non justifiée)  → NON RÉMUNÉRÉ → retenue sur salaire.
 *
 * L'engine est volontairement découplé du module Rémunération : il prend en
 * entrée des heures + un taux horaire brut, et rend un impact chiffré. Le calcul
 * exact des IJSS / du maintien maladie dépend de l'ancienneté et sort du
 * périmètre de cet incrément (traitement INDEMNIFIED, retenue employeur laissée
 * à 0 par défaut — l'employeur maintient tout ou partie du salaire).
 */

export type PayTreatment = "PAID" | "INDEMNIFIED" | "UNPAID";

export interface AbsencePayRule {
  code: AbsenceCode;
  /** Libellé court affiché à l'admin. */
  label: string;
  treatment: PayTreatment;
  /** Résumé de l'effet sur la fiche de paie. */
  payslipEffect: string;
  /** true si l'absence décompte le solde de congés payés. */
  consumesPaidLeave: boolean;
}

/**
 * Règle de paie par code d'absence. Source de vérité partageable entre le
 * planning (choix Congé/Maladie/…) et le module Rémunération (fiche de paie).
 */
export const ABSENCE_PAY_RULES: Record<AbsenceCode, AbsencePayRule> = {
  CONGE: {
    code: "CONGE",
    label: "Congé payé",
    treatment: "PAID",
    payslipEffect:
      "Rémunéré — maintien de salaire, décompté du solde de congés payés",
    consumesPaidLeave: true,
  },
  FORMATION_ABS: {
    code: "FORMATION_ABS",
    label: "Formation externe",
    treatment: "PAID",
    payslipEffect: "Rémunéré — temps de travail assimilé (formation)",
    consumesPaidLeave: false,
  },
  MALADIE: {
    code: "MALADIE",
    label: "Arrêt maladie",
    treatment: "INDEMNIFIED",
    payslipEffect:
      "Indemnisé — IJSS + maintien employeur selon ancienneté (carence légale 3 j)",
    consumesPaidLeave: false,
  },
  ABSENT: {
    code: "ABSENT",
    label: "Absence non rémunérée",
    treatment: "UNPAID",
    payslipEffect:
      "Non rémunéré — retenue sur salaire (heures non travaillées)",
    consumesPaidLeave: false,
  },
};

export interface AbsencePayLine {
  code: AbsenceCode;
  label: string;
  treatment: PayTreatment;
  /** Heures d'absence sur la période pour ce code. */
  hours: number;
  /** Impact € sur le brut : négatif = retenue (UNPAID) ; 0 sinon. */
  amount: number;
  payslipEffect: string;
}

export interface AbsencePayImpact {
  /** Heures d'absence rémunérées (CONGE + FORMATION_ABS). */
  paidHours: number;
  /** Heures d'absence indemnisées (MALADIE). */
  indemnifiedHours: number;
  /** Heures d'absence non rémunérées (ABSENT). */
  unpaidHours: number;
  /** Retenue brute totale sur salaire (€, valeur positive = montant retenu). */
  salaryDeduction: number;
  /** Heures de congés payés consommées sur la période. */
  paidLeaveHours: number;
  /** Détail par code d'absence présent sur la période. */
  lines: AbsencePayLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ordre d'affichage stable (rémunéré → indemnisé → non rémunéré). */
const DISPLAY_ORDER: AbsenceCode[] = [
  "CONGE",
  "FORMATION_ABS",
  "MALADIE",
  "ABSENT",
];

/**
 * Calcule l'impact paie d'un ensemble d'absences sur une période.
 *
 * @param absenceHoursByCode heures d'absence cumulées par code sur la période
 * @param hourlyRate taux horaire brut (€/h) — sert au chiffrage de la retenue
 *                   des heures non rémunérées. Un taux ≤ 0 → aucune retenue.
 */
export function computeAbsencePayImpact(
  absenceHoursByCode: Partial<Record<AbsenceCode, number>>,
  hourlyRate: number
): AbsencePayImpact {
  const rate = Math.max(0, hourlyRate || 0);
  const lines: AbsencePayLine[] = [];
  let paidHours = 0;
  let indemnifiedHours = 0;
  let unpaidHours = 0;
  let salaryDeduction = 0;
  let paidLeaveHours = 0;

  for (const code of DISPLAY_ORDER) {
    const hours = absenceHoursByCode[code] ?? 0;
    if (hours <= 0) continue;
    const rule = ABSENCE_PAY_RULES[code];
    let amount = 0;

    if (rule.treatment === "PAID") {
      paidHours += hours;
    } else if (rule.treatment === "INDEMNIFIED") {
      indemnifiedHours += hours;
    } else {
      unpaidHours += hours;
      const deduction = round2(hours * rate);
      amount = deduction > 0 ? -deduction : 0; // évite -0
      salaryDeduction += deduction;
    }
    if (rule.consumesPaidLeave) paidLeaveHours += hours;

    lines.push({
      code,
      label: rule.label,
      treatment: rule.treatment,
      hours: round2(hours),
      amount,
      payslipEffect: rule.payslipEffect,
    });
  }

  return {
    paidHours: round2(paidHours),
    indemnifiedHours: round2(indemnifiedHours),
    unpaidHours: round2(unpaidHours),
    salaryDeduction: round2(salaryDeduction),
    paidLeaveHours: round2(paidLeaveHours),
    lines,
  };
}