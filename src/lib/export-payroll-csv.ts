/**
 * Export CSV « comptable » de la paie du mois — colonnes détaillées (heures
 * ventilées par nature + montants) pour saisie/import dans un logiciel de paie
 * (Silae, Sage Paie…) ou transmission à l'expert-comptable.
 *
 * Format : séparateur `;` et décimales à la virgule (convention Excel FR),
 * avec BOM UTF-8 pour l'ouverture correcte des accents sous Excel.
 *
 * NB : ce n'est PAS une DSN (déclaration sociale nominative) au format
 * normalisé phase 3 — c'est un récap exploitable manuellement. Une vraie DSN
 * exige un logiciel agréé.
 */

import type { EmployeeStatus, ContractType } from "@prisma/client";
import { STATUS_LABELS } from "@/types";
import type { PayrollLine } from "@/lib/payroll-calc";

const CONTRACT_LABELS: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  APPRENTISSAGE: "Apprentissage",
  STAGE: "Stage",
  INTERIM: "Intérim",
};

export type PayrollCsvRow = {
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  contractType: ContractType;
  weeklyHours: number;
  line: PayrollLine;
};

const HEADERS = [
  "Nom",
  "Prénom",
  "Statut",
  "Type contrat",
  "Heures contrat/sem",
  "Heures normales",
  "Heures sup 25%",
  "Heures sup 50%",
  "Heures congés payés",
  "Heures formation",
  "Heures maladie (employeur)",
  "Heures maladie (carence)",
  "Heures absence non payée",
  "Brut estimé",
  "Cotisations salariales",
  "Net estimé",
  "Cotisations patronales",
  "Coût total employeur",
];

function h(n: number): string {
  return n.toFixed(1).replace(".", ",");
}
function eur(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
function field(v: string): string {
  // Échappe si le champ contient le séparateur, un guillemet ou un saut de ligne.
  if (/[;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Construit le contenu CSV (avec BOM) pour le mois donné. */
export function buildPayrollCsv(rows: PayrollCsvRow[]): string {
  const lines: string[] = [HEADERS.map(field).join(";")];

  for (const r of rows) {
    const l = r.line;
    lines.push(
      [
        r.lastName,
        r.firstName,
        STATUS_LABELS[r.status],
        CONTRACT_LABELS[r.contractType],
        h(r.weeklyHours),
        h(l.taskHoursRegular),
        h(l.overtimeHours25),
        h(l.overtimeHours50),
        h(l.paidLeaveHours),
        h(l.trainingHours),
        h(l.sickHoursEmployerPaid),
        h(l.sickHoursWaitingPeriod),
        h(l.unpaidAbsenceHours),
        eur(l.grossEmployer),
        eur(l.socialContributionsEmployee),
        eur(l.netEstimated),
        eur(l.socialContributionsEmployer),
        eur(l.totalEmployerCost),
      ]
        .map(field)
        .join(";")
    );
  }

  // BOM UTF-8 pour Excel + CRLF (Windows-friendly).
  return "﻿" + lines.join("\r\n") + "\r\n";
}
