import {
  computePayrollLine,
  DEFAULT_PAYROLL_RATES,
  type EmployeeForPayroll,
  type PayrollRates,
} from "@/lib/payroll-calc";
import type { ScheduleEntryDTO } from "@/types";

/**
 * Agrégation « tableau de bord RH » (pilotage titulaire) — réutilise le moteur
 * de paie (`computePayrollLine`) pour dériver, mois par mois : heures
 * travaillées, heures sup, absences (congé / maladie / injustifiée) et coût
 * employeur estimé. Les chiffres restent des ESTIMATIONS (mêmes hypothèses que
 * le module Rémunération).
 */

export type HrMonthStat = {
  /** "YYYY-MM" */
  key: string;
  /** Libellé court, ex. "juil. 25" */
  label: string;
  workedHours: number;
  overtimeHours: number;
  leaveHours: number; // congés payés
  sickHours: number; // maladie (toutes catégories)
  unpaidHours: number; // absent non justifié
  /** Absentéisme « subi » = maladie + absent injustifié. */
  absenceHours: number;
  /** Taux d'absentéisme = absenceHours / (travaillées + toutes absences). */
  absenteeismRate: number;
  cost: number;
  /** CA HT du mois (saisi dans Rémunération) — null si non renseigné. */
  revenueHT: number | null;
  /** Ratio coût employeur / CA HT (null si pas de CA). */
  salaryToRevenue: number | null;
};

export type HrEmployeeStat = {
  id: string;
  name: string;
  status: EmployeeForPayroll["status"];
  workedHours: number;
  overtimeHours: number;
  absenceHours: number;
  cost: number;
};

export type HrDashboard = {
  months: HrMonthStat[];
  employees: HrEmployeeStat[];
};

/** Les N derniers mois (courant inclus), du plus ancien au plus récent. */
export function lastMonths(now: Date, n: number): Array<{ key: string; label: string; start: Date; end: Date }> {
  const out: Array<{ key: string; label: string; start: Date; end: Date }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 0)); // dernier jour du mois
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = start
      .toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
      .replace(".", "");
    out.push({ key, label, start, end });
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function computeHrDashboard(
  employees: EmployeeForPayroll[],
  entries: ScheduleEntryDTO[], // toutes les entrées sur la période (date en ISO)
  months: Array<{ key: string; label: string; start: Date; end: Date }>,
  rates: PayrollRates = DEFAULT_PAYROLL_RATES,
  /** CA HT par mois ("YYYY-MM" → €), pour le ratio masse salariale / CA. */
  revenueByMonth: Map<string, number> = new Map()
): HrDashboard {
  // Index : mois → employé → entrées.
  const byMonthEmp = new Map<string, Map<string, ScheduleEntryDTO[]>>();
  for (const m of months) byMonthEmp.set(m.key, new Map());
  for (const e of entries) {
    const key = e.date.slice(0, 7); // YYYY-MM
    const bucket = byMonthEmp.get(key);
    if (!bucket) continue;
    const arr = bucket.get(e.employeeId) ?? [];
    arr.push(e);
    bucket.set(e.employeeId, arr);
  }

  // Cumul par employé sur toute la période.
  const empTotals = new Map<string, HrEmployeeStat>();
  for (const emp of employees) {
    empTotals.set(emp.id, {
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      status: emp.status,
      workedHours: 0,
      overtimeHours: 0,
      absenceHours: 0,
      cost: 0,
    });
  }

  const monthStats: HrMonthStat[] = months.map((m) => {
    const bucket = byMonthEmp.get(m.key)!;
    let worked = 0;
    let overtime = 0;
    let leave = 0;
    let sick = 0;
    let unpaid = 0;
    let training = 0;
    let cost = 0;

    for (const emp of employees) {
      const line = computePayrollLine(emp, bucket.get(emp.id) ?? [], m.start, rates);
      const empWorked = line.taskHoursRegular + line.overtimeHours25 + line.overtimeHours50;
      const empOt = line.overtimeHours25 + line.overtimeHours50;
      const empSick =
        line.sickHoursEmployerPaid + line.sickHoursWaitingPeriod + line.sickHoursCpam;
      const empAbs = empSick + line.unpaidAbsenceHours;

      worked += empWorked;
      overtime += empOt;
      leave += line.paidLeaveHours;
      sick += empSick;
      unpaid += line.unpaidAbsenceHours;
      training += line.trainingHours;
      cost += line.totalEmployerCost;

      const t = empTotals.get(emp.id)!;
      t.workedHours += empWorked;
      t.overtimeHours += empOt;
      t.absenceHours += empAbs;
      t.cost += line.totalEmployerCost;
    }

    const allAbsence = leave + sick + unpaid + training;
    const denom = worked + allAbsence;
    const absenceHours = sick + unpaid;
    const roundedCost = Math.round(cost);
    const revenueHT = revenueByMonth.get(m.key) ?? null;
    return {
      key: m.key,
      label: m.label,
      workedHours: r1(worked),
      overtimeHours: r1(overtime),
      leaveHours: r1(leave),
      sickHours: r1(sick),
      unpaidHours: r1(unpaid),
      absenceHours: r1(absenceHours),
      absenteeismRate: denom > 0 ? absenceHours / denom : 0,
      cost: roundedCost,
      revenueHT,
      salaryToRevenue: revenueHT && revenueHT > 0 ? roundedCost / revenueHT : null,
    };
  });

  const employeeStats = Array.from(empTotals.values())
    .map((e) => ({
      ...e,
      workedHours: r1(e.workedHours),
      overtimeHours: r1(e.overtimeHours),
      absenceHours: r1(e.absenceHours),
      cost: Math.round(e.cost),
    }))
    .sort((a, b) => b.cost - a.cost);

  return { months: monthStats, employees: employeeStats };
}
