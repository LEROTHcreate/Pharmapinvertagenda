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

import { ScheduleType, type EmployeeStatus, type PayMode } from "@prisma/client";
import { type ScheduleEntryDTO, SLOT_HOURS } from "@/types";
import { isWorkingDay } from "@/lib/planning-tips";

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

export type PayrollRates = {
  socialContributionsEmployee: number;
  socialContributionsEmployer: number;
  overtimePremium25: number;
  overtimePremium50: number;
  sickWaitingDays: number;
  sickEmployerMaintenance: number;
  sickMaintenanceMinSeniorityMonths: number;
};

export type EmployeeForPayroll = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: number;
  /** Mode de rémunération : taux horaire OU salaire mensuel. */
  payMode: PayMode;
  hourlyGrossRate: number | null;
  monthlyGrossSalary: number | null;
  /** Coefficient conventionnel saisi (null = estimé via ancienneté). */
  coefficient: number | null;
  hireDate: Date | null;
};

export type PayrollLine = {
  employeeId: string;
  employeeName: string;
  /** Statut métier (pour le benchmark sectoriel) */
  status: EmployeeStatus;
  /** Ancienneté en mois au 1er du mois analysé (pour l'échelon/coefficient) */
  seniorityMonths: number;
  /** Mode de rémunération appliqué */
  payMode: PayMode;
  /** Taux horaire brut saisi (€) — null en mode mensuel ou si non renseigné */
  hourlyGrossRate: number | null;
  /** Salaire mensuel brut saisi (€) — null en mode horaire ou si non renseigné */
  monthlyGrossSalary: number | null;
  /** Taux horaire EFFECTIF utilisé (saisi en horaire, ou implicite =
   *  salaire mensuel / heures mensuelles contractuelles). Sert au benchmark. */
  effectiveHourlyRate: number | null;
  /** Coefficient saisi (null si estimé via ancienneté côté benchmark) */
  coefficient: number | null;

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
  /** Surcoût € dû AUX MAJORATIONS d'heures sup (part +25/+50 seule, hors base) */
  overtimePremiumCost: number;
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
  // Heures TASK ventilées par semaine ISO → calcul des heures sup à la
  // semaine (et non au mois, cf. Art. L3121-28).
  const taskSlotsByWeek = new Map<string, number>();
  // Pour la maladie on doit distinguer carence (3 premiers jours) du reste
  const sickSlotsByDate = new Map<string, number>();

  for (const e of monthEntries) {
    if (e.type === ScheduleType.TASK) {
      taskSlots++;
      const wk = isoWeekKey(e.date);
      taskSlotsByWeek.set(wk, (taskSlotsByWeek.get(wk) ?? 0) + 1);
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
  // Un "arrêt" = jours de MALADIE qui se suivent. ⚠️ Le planning ne contient
  // que des jours OUVRÉS (officine fermée dimanche + fériés) : un arrêt continu
  // à cheval sur un week-end laisse un trou samedi→lundi de 2-3 jours
  // calendaires. On NE doit PAS le confondre avec un nouvel arrêt (sinon la
  // carence de 3 j est ré-appliquée à chaque semaine). On considère donc qu'il
  // y a un NOUVEL arrêt seulement si au moins un jour OUVRÉ sépare deux dates
  // de maladie consécutives (= retour effectif au travail).
  const sickDatesSorted = Array.from(sickSlotsByDate.keys()).sort();
  let sickSlotsWaiting = 0;
  let sickSlotsAfterWaiting = 0;
  let waitingDaysUsed = 0;
  let prevDateIso: string | null = null;
  for (const dateIso of sickDatesSorted) {
    if (prevDateIso && workingDaysBetween(prevDateIso, dateIso) > 0) {
      waitingDaysUsed = 0; // retour au travail entre les deux → nouvel arrêt
    }
    const slots = sickSlotsByDate.get(dateIso) ?? 0;
    if (waitingDaysUsed < rates.sickWaitingDays) {
      sickSlotsWaiting += slots;
      waitingDaysUsed++;
    } else {
      sickSlotsAfterWaiting += slots;
    }
    prevDateIso = dateIso;
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

  // ─── Heures sup (calcul HEBDOMADAIRE — Art. L3121-28) ───────────────
  // Les heures sup se comptent SEMAINE par SEMAINE : +25 % pour les 8
  // premières heures au-delà du contrat, +50 % au-delà. Agréger au mois
  // masquerait les pics intra-mois (une semaine à 46 h compensée par une
  // semaine creuse) et sous-estimerait les majorations les plus coûteuses.
  // On somme donc les heures sup de chaque semaine ISO présente dans le mois.
  let overtimeHours25 = 0;
  let overtimeHours50 = 0;
  for (const weekSlots of taskSlotsByWeek.values()) {
    const weekHours = weekSlots * SLOT_HOURS;
    const weekOvertime = Math.max(0, weekHours - employee.weeklyHours);
    overtimeHours25 += Math.min(weekOvertime, 8);
    overtimeHours50 += Math.max(0, weekOvertime - 8);
  }
  const overtimeTotal = overtimeHours25 + overtimeHours50;
  const taskHours = taskSlots * SLOT_HOURS;
  const taskHoursRegular = taskHours - overtimeTotal;
  // Base mensuelle contractuelle (151,67 h pour 35 h) — sert au taux horaire
  // implicite du mode mensualisé, pas au calcul des heures sup ci-dessus.
  const contractMonthlyHours = (employee.weeklyHours * 52) / 12;

  // ─── Montants ──────────────────────────────────────────────────────
  // Taux horaire EFFECTIF selon le mode de rémunération :
  //  - MONTHLY : salaire mensuel ÷ heures mensuelles contractuelles
  //              (respecte donc le contrat 30h/35h/… via contractMonthlyHours)
  //  - HOURLY  : taux horaire saisi
  const isMonthly =
    employee.payMode === "MONTHLY" && employee.monthlyGrossSalary != null;
  const baseRate = isMonthly
    ? contractMonthlyHours > 0
      ? (employee.monthlyGrossSalary as number) / contractMonthlyHours
      : 0
    : rate ?? 0;
  const grossRegular = taskHoursRegular * baseRate;
  const grossOT25 = overtimeHours25 * baseRate * (1 + rates.overtimePremium25);
  const grossOT50 = overtimeHours50 * baseRate * (1 + rates.overtimePremium50);
  // Surcoût des majorations seul (la part au-delà du taux de base) — sert à
  // chiffrer ce que coûtent réellement les heures sup vs un volume contractuel.
  const overtimePremiumCost =
    overtimeHours25 * baseRate * rates.overtimePremium25 +
    overtimeHours50 * baseRate * rates.overtimePremium50;
  const grossLeave = leaveSlots * SLOT_HOURS * baseRate;
  const grossTraining = trainingSlots * SLOT_HOURS * baseRate;
  const grossSickEmployer = sickEmployerSlots * SLOT_HOURS * baseRate;

  let grossEmployer: number;
  if (isMonthly) {
    // Mensualisé : la base est le salaire mensuel FIXE (congés payés et
    // formation déjà inclus dans ce salaire maintenu). On déduit uniquement
    // les absences NON maintenues : ABSENT + jours de carence maladie en
    // entier, et la part non maintenue de la maladie post-carence (IJSS CPAM).
    // Les heures sup au-delà du contrat sont ajoutées EN PLUS.
    const postCarenceDeductRate = eligibleForEmployerMaintenance
      ? 1 - rates.sickEmployerMaintenance
      : 1;
    const unpaidDeduction =
      (unpaidAbsenceSlots + sickSlotsWaiting) * SLOT_HOURS * baseRate +
      sickSlotsAfterWaiting * SLOT_HOURS * baseRate * postCarenceDeductRate;
    grossEmployer =
      Math.max(0, (employee.monthlyGrossSalary as number) - unpaidDeduction) +
      grossOT25 +
      grossOT50;
  } else {
    // Au taux horaire : on paie chaque catégorie d'heures au taux.
    grossEmployer =
      grossRegular +
      grossOT25 +
      grossOT50 +
      grossLeave +
      grossTraining +
      grossSickEmployer;
  }

  const socialContributionsEmployee =
    grossEmployer * rates.socialContributionsEmployee;
  // Net calculé à partir des montants ARRONDIS (brut, cotisations) pour que la
  // colonne réconcilie exactement : net affiché = brut affiché − cotis affichées.
  const netEstimated =
    round2(grossEmployer) - round2(socialContributionsEmployee);
  const socialContributionsEmployer =
    grossEmployer * rates.socialContributionsEmployer;
  const totalEmployerCost = grossEmployer + socialContributionsEmployer;

  return {
    employeeId: employee.id,
    employeeName: fullName,
    status: employee.status,
    seniorityMonths,
    payMode: employee.payMode,
    hourlyGrossRate: rate,
    monthlyGrossSalary: employee.monthlyGrossSalary,
    effectiveHourlyRate: isMonthly ? round2(baseRate) : rate,
    coefficient: employee.coefficient,
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
    overtimePremiumCost: round2(overtimePremiumCost),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsBetween(a: Date, b: Date): number {
  let months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  // Le mois en cours n'est révolu que si le jour d'embauche est atteint :
  // embauché le 30 et analysé le 1er → l'ancienneté ne compte pas ce mois.
  if (b.getDate() < a.getDate()) months--;
  return months;
}

/** Clé de semaine ISO (lundi, UTC) d'une date "YYYY-MM-DD". */
function isoWeekKey(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=dim, 1=lun…6=sam
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours OUVRÉS (lun-sam hors fériés) strictement entre deux dates ISO. */
function workingDaysBetween(fromIso: string, toIso: string): number {
  let count = 0;
  const cur = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur < end) {
    if (isWorkingDay(cur.toISOString().slice(0, 10))) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}
