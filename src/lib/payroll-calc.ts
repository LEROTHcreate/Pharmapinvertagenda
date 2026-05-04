/**
 * Calculs de rémunération mensuelle — module d'AIDE À LA DÉCISION.
 *
 * ⚠️ IMPORTANT — Ce module n'est PAS un système de paie légal.
 * Pour les bulletins officiels, utiliser un logiciel agréé (Silae, Sage Paie,
 * Cegid…) ou passer par un expert-comptable. Le calcul ci-dessous est une
 * ESTIMATION basée sur des règles publiques simplifiées.
 *
 * ─── Règles françaises prises en compte ────────────────────────────────
 *
 * **Heures supplémentaires** (Art. L3121-28 du Code du travail)
 *  - +25% pour les 8 premières h/sem au-delà du contrat
 *  - +50% au-delà
 *  - Pour un contrat 35h, base mensuelle 151,67h
 *
 * **Congés payés (CONGE)**
 *  - 100% rémunérés par l'employeur (= maintien de salaire)
 *  - Pas de carence
 *
 * **Maladie (MALADIE)**
 *  - **Carence : 3 jours** non payés par l'employeur (sauf accord particulier)
 *  - **Du 4e jour** : Indemnités Journalières Sécurité Sociale (IJSS) =
 *    50% du salaire journalier de référence, plafonné. Versées par la CPAM,
 *    PAS par l'employeur.
 *  - **Convention Collective Pharmacie d'Officine (IDCC 1996)** : maintien
 *    de salaire par l'employeur SI ancienneté ≥ 1 an, dégressif. Le détail
 *    exact dépend de la convention en vigueur — on l'estime ici à 90%
 *    pendant 30 jours puis 66% pendant 30 jours.
 *  - Conclusion : on distingue dans le calcul les heures payées par
 *    l'employeur des heures payées par la CPAM.
 *
 * **Formation externe (FORMATION_ABS)**
 *  - 100% rémunérée par l'employeur (temps de travail)
 *
 * **Absent non précisé (ABSENT)**
 *  - 0% — pas rémunéré (justificatif manquant)
 *
 * **Cotisations sociales (taux moyens 2024-2025)**
 *  - Salariales : ~22% du brut (CSG/CRDS, sécu, retraite, chômage…)
 *  - Patronales : ~42% du brut (charges employeur)
 *  - Ces taux varient selon : statut cadre/non-cadre, tranches, exonérations
 *    Fillon, secteur. Paramétrables sur la page de réglages.
 *
 * Sources : URSSAF, Service-Public.fr, Code du travail.
 */

import { ScheduleType } from "@prisma/client";
import type { ScheduleEntryDTO } from "@/types";

const SLOT_HOURS = 0.5;

// Taux indicatifs par défaut — modifiables via la page paramètres pharmacie.
export const DEFAULT_PAYROLL_RATES = {
  /** Cotisations salariales (déductions sur le brut) */
  socialContributionsEmployee: 0.22,
  /** Cotisations patronales (à charge employeur, en plus du brut) */
  socialContributionsEmployer: 0.42,
  /** Premium pour les 8 premières h sup hebdo */
  overtimePremium25: 0.25,
  /** Premium pour les h sup au-delà des 8 */
  overtimePremium50: 0.5,
  /** Jours de carence maladie (au début de l'arrêt — non payés par employeur) */
  sickWaitingDays: 3,
  /** Maintien employeur après carence (% du salaire) */
  sickEmployerMaintenance: 0.9,
  /** Ancienneté minimale en mois pour bénéficier du maintien CC pharmacie */
  sickMaintenanceMinSeniorityMonths: 12,
} as const;

export type PayrollRates = typeof DEFAULT_PAYROLL_RATES;

export type EmployeeForPayroll = {
  id: string;
  firstName: string;
  lastName: string;
  weeklyHours: number;
  hourlyGrossRate: number | null;
  hireDate: Date | null;
};

export type PayrollLine = {
  employeeId: string;
  employeeName: string;
  /** Taux horaire brut (€) — null si pas encore renseigné */
  hourlyGrossRate: number | null;

  // ─── Heures du mois ventilées ──────────────────────────────────────
  /** Heures TASK travaillées dans le mois (hors heures sup) */
  taskHoursRegular: number;
  /** Heures sup à +25% */
  overtimeHours25: number;
  /** Heures sup à +50% */
  overtimeHours50: number;
  /** Heures CONGE payées 100% par employeur */
  paidLeaveHours: number;
  /** Heures FORMATION_ABS payées 100% par employeur */
  trainingHours: number;
  /** Heures MALADIE payées par employeur (= maladie au-delà de la carence,
   *  dans la limite des conditions d'ancienneté de la CC pharmacie) */
  sickHoursEmployerPaid: number;
  /** Heures MALADIE en carence (non payées par employeur) */
  sickHoursWaitingPeriod: number;
  /** Heures MALADIE prises en charge par la CPAM (IJSS) — pour info,
   *  PAS dans le coût employeur */
  sickHoursCpam: number;
  /** Heures ABSENT non précisé (non payées) */
  unpaidAbsenceHours: number;

  // ─── Montants en € (estimations) ───────────────────────────────────
  /** Brut payé par l'employeur (heures travaillées + congés + formation +
   *  maintien maladie) — sans les IJSS CPAM */
  grossEmployer: number;
  /** Cotisations salariales (déductions du brut) */
  socialContributionsEmployee: number;
  /** Net approximatif (brut - cotisations salariales) */
  netEstimated: number;
  /** Cotisations patronales (en plus, à charge de l'officine) */
  socialContributionsEmployer: number;
  /** Coût total pour l'officine (brut + patronales) */
  totalEmployerCost: number;
};

/**
 * Calcule le détail mensuel d'un employé.
 *
 * @param employee Profil employé avec taux horaire
 * @param monthEntries Toutes les ScheduleEntry du mois pour cet employé
 * @param month Premier jour du mois (date)
 * @param rates Taux de cotisations à appliquer
 */
export function computePayrollLine(
  employee: EmployeeForPayroll,
  monthEntries: ScheduleEntryDTO[],
  month: Date,
  rates: PayrollRates = DEFAULT_PAYROLL_RATES
): PayrollLine {
  const empName = `${employee.firstName} ${employee.lastName}`.trim();
  const rate = employee.hourlyGrossRate;
  const fullName = empName.endsWith("—")
    ? employee.firstName
    : empName;

  // ─── Comptage des slots par catégorie ──────────────────────────────
  let taskSlots = 0;
  let leaveSlots = 0;
  let trainingSlots = 0;
  let unpaidAbsenceSlots = 0;
  // Pour la maladie on doit distinguer carence (3 premiers jours) du reste
  const sickSlotsByDate = new Map<string, number>();

  for (const e of monthEntries) {
    if (e.type === ScheduleType.TASK) {
      taskSlots++;
    } else if (e.type === ScheduleType.ABSENCE) {
      switch (e.absenceCode) {
        case "CONGE":
          leaveSlots++;
          break;
        case "FORMATION_ABS":
          trainingSlots++;
          break;
        case "MALADIE":
          sickSlotsByDate.set(
            e.date,
            (sickSlotsByDate.get(e.date) ?? 0) + 1
          );
          break;
        case "ABSENT":
        default:
          unpaidAbsenceSlots++;
          break;
      }
    }
  }

  // ─── Maladie : appliquer la carence sur les 3 premiers jours d'arrêt
  // Note : on suppose qu'un "arrêt" = jours consécutifs de MALADIE. Si
  // plusieurs arrêts dans le mois, chacun a sa propre carence.
  const sickDatesSorted = Array.from(sickSlotsByDate.keys()).sort();
  let sickSlotsWaiting = 0;
  let sickSlotsAfterWaiting = 0;
  let waitingDaysUsed = 0;
  let prevDate: Date | null = null;
  for (const dateIso of sickDatesSorted) {
    const d = new Date(`${dateIso}T00:00:00Z`);
    // Reset de la carence si > 1 jour d'écart (= nouvel arrêt)
    if (prevDate) {
      const diffDays = Math.round(
        (d.getTime() - prevDate.getTime()) / 86400000
      );
      if (diffDays > 1) waitingDaysUsed = 0;
    }
    const slots = sickSlotsByDate.get(dateIso) ?? 0;
    if (waitingDaysUsed < rates.sickWaitingDays) {
      sickSlotsWaiting += slots;
      waitingDaysUsed++;
    } else {
      sickSlotsAfterWaiting += slots;
    }
    prevDate = d;
  }

  // Maintien employeur après carence : nécessite ancienneté minimale.
  const seniorityMonths = employee.hireDate
    ? monthsBetween(employee.hireDate, month)
    : 0;
  const eligibleForEmployerMaintenance =
    seniorityMonths >= rates.sickMaintenanceMinSeniorityMonths;

  // En % du salaire normal, payé par l'employeur (le reste serait IJSS CPAM)
  const sickEmployerSlots = eligibleForEmployerMaintenance
    ? sickSlotsAfterWaiting * rates.sickEmployerMaintenance
    : 0;
  // Note : pour l'estimation, on indique aussi les heures que la CPAM
  // prendrait théoriquement en charge — mais ce n'est PAS un coût employeur.
  const sickCpamSlots = sickSlotsAfterWaiting - sickEmployerSlots;

  // ─── Heures sup ────────────────────────────────────────────────────
  // Calcul mensuel : on compare au contrat × (semaines dans le mois ≈ 4.33)
  // En toute rigueur, les h sup se calculent par SEMAINE (pas par mois).
  // Pour l'estimation mensuelle, on prend la base mensualisée du contrat.
  const contractMonthlyHours = (employee.weeklyHours * 52) / 12; // Ex: 35h → 151,67h
  const taskHours = taskSlots * SLOT_HOURS;
  const overtimeTotal = Math.max(0, taskHours - contractMonthlyHours);
  // Limite pour le bonus à 25% : (8h × 4,33 sem) ≈ 34,67h sup à 25% max
  const overtime25Cap = (8 * 52) / 12;
  const overtimeHours25 = Math.min(overtimeTotal, overtime25Cap);
  const overtimeHours50 = Math.max(0, overtimeTotal - overtime25Cap);
  const taskHoursRegular = taskHours - overtimeTotal;

  // ─── Montants ──────────────────────────────────────────────────────
  const baseRate = rate ?? 0;
  const grossRegular = taskHoursRegular * baseRate;
  const grossOT25 = overtimeHours25 * baseRate * (1 + rates.overtimePremium25);
  const grossOT50 = overtimeHours50 * baseRate * (1 + rates.overtimePremium50);
  const grossLeave = leaveSlots * SLOT_HOURS * baseRate;
  const grossTraining = trainingSlots * SLOT_HOURS * baseRate;
  const grossSickEmployer = sickEmployerSlots * SLOT_HOURS * baseRate;

  const grossEmployer =
    grossRegular +
    grossOT25 +
    grossOT50 +
    grossLeave +
    grossTraining +
    grossSickEmployer;

  const socialContributionsEmployee =
    grossEmployer * rates.socialContributionsEmployee;
  const netEstimated = grossEmployer - socialContributionsEmployee;
  const socialContributionsEmployer =
    grossEmployer * rates.socialContributionsEmployer;
  const totalEmployerCost = grossEmployer + socialContributionsEmployer;

  return {
    employeeId: employee.id,
    employeeName: fullName,
    hourlyGrossRate: rate,
    taskHoursRegular,
    overtimeHours25,
    overtimeHours50,
    paidLeaveHours: leaveSlots * SLOT_HOURS,
    trainingHours: trainingSlots * SLOT_HOURS,
    sickHoursEmployerPaid: sickEmployerSlots * SLOT_HOURS,
    sickHoursWaitingPeriod: sickSlotsWaiting * SLOT_HOURS,
    sickHoursCpam: sickCpamSlots * SLOT_HOURS,
    unpaidAbsenceHours: unpaidAbsenceSlots * SLOT_HOURS,
    grossEmployer: round2(grossEmployer),
    socialContributionsEmployee: round2(socialContributionsEmployee),
    netEstimated: round2(netEstimated),
    socialContributionsEmployer: round2(socialContributionsEmployer),
    totalEmployerCost: round2(totalEmployerCost),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsBetween(a: Date, b: Date): number {
  return (
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  );
}
