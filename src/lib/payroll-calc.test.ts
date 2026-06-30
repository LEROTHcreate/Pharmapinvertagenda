import { describe, expect, it } from "vitest";
import { ScheduleType, type TaskCode } from "@prisma/client";
import { computePayrollLine, type EmployeeForPayroll } from "./payroll-calc";
import type { ScheduleEntryDTO } from "@/types";

const MONTH = new Date(Date.UTC(2026, 5, 1)); // juin 2026

// Lundis des 4 semaines de juin 2026 (1er juin = lundi).
const JUNE_MONDAYS = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"];

/**
 * Génère `hours` heures de TASK (1 créneau = 0,5 h), RÉPARTIES uniformément
 * sur les 4 semaines de juin (round-robin) — les heures sup se calculant à la
 * semaine, on ne doit pas tout entasser sur une seule date.
 */
function taskHours(hours: number): ScheduleEntryDTO[] {
  const slots = Math.round(hours * 2);
  return Array.from({ length: slots }, (_, i) => ({
    id: `t${i}`,
    employeeId: "e",
    date: JUNE_MONDAYS[i % JUNE_MONDAYS.length],
    timeSlot: "08:00",
    type: ScheduleType.TASK,
    taskCode: "COMPTOIR" as TaskCode,
    absenceCode: null,
    notes: null,
  }));
}

/** Génère des créneaux de MALADIE sur une liste de dates ISO (14 slots/jour = 7 h). */
function sickDays(dates: string[]): ScheduleEntryDTO[] {
  const out: ScheduleEntryDTO[] = [];
  dates.forEach((date, di) => {
    for (let s = 0; s < 14; s++) {
      out.push({
        id: `s${di}-${s}`,
        employeeId: "e",
        date,
        timeSlot: "08:00",
        type: ScheduleType.ABSENCE,
        taskCode: null,
        absenceCode: "MALADIE",
        notes: null,
      });
    }
  });
  return out;
}

function emp(partial: Partial<EmployeeForPayroll>): EmployeeForPayroll {
  return {
    id: "e",
    firstName: "Test",
    lastName: "Employé",
    status: "PREPARATEUR",
    weeklyHours: 35,
    payMode: "HOURLY",
    hourlyGrossRate: null,
    monthlyGrossSalary: null,
    coefficient: null,
    hireDate: null,
    ...partial,
  };
}

describe("computePayrollLine — mode HORAIRE", () => {
  it("paie les heures travaillées au taux (sous le contrat = pas d'heures sup)", () => {
    const line = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 35 }),
      taskHours(100),
      MONTH
    );
    expect(line.overtimeHours25 + line.overtimeHours50).toBe(0);
    expect(line.grossEmployer).toBeCloseTo(1500, 0); // 100h × 15
    expect(line.effectiveHourlyRate).toBe(15);
  });
});

describe("computePayrollLine — mode MENSUEL", () => {
  it("verse le salaire mensuel fixe même si moins d'heures planifiées", () => {
    const line = computePayrollLine(
      emp({ payMode: "MONTHLY", monthlyGrossSalary: 2000, weeklyHours: 35 }),
      taskHours(100), // < contrat (151,67h) → mensualisé maintenu
      MONTH
    );
    expect(line.grossEmployer).toBeCloseTo(2000, 0);
    // Taux horaire implicite = 2000 / 151,67 ≈ 13,19
    expect(line.effectiveHourlyRate).toBeCloseTo(13.19, 1);
  });

  it("ajoute les heures sup EN PLUS du salaire mensuel", () => {
    const line = computePayrollLine(
      emp({ payMode: "MONTHLY", monthlyGrossSalary: 2000, weeklyHours: 35 }),
      taskHours(170), // > contrat → heures sup
      MONTH
    );
    expect(line.overtimeHours25 + line.overtimeHours50).toBeGreaterThan(0);
    expect(line.grossEmployer).toBeGreaterThan(2000);
  });
});

describe("computePayrollLine — carence maladie (arrêt à cheval sur le week-end)", () => {
  it("n'applique la carence qu'UNE fois quand l'arrêt continu enjambe le dimanche", () => {
    // Arrêt continu lun→sam (S1) + lun→mar (S2) = 8 jours ouvrés ; le dimanche
    // n'est pas saisi (officine fermée). La carence de 3 j ne doit PAS être
    // ré-appliquée à la 2e semaine.
    const sick = sickDays([
      "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05",
      "2026-06-06", "2026-06-08", "2026-06-09",
    ]);
    const line = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 35 }),
      sick,
      MONTH
    );
    // 3 jours de carence × 7 h = 21 h (et surtout PAS 42 h = 6 jours)
    expect(line.sickHoursWaitingPeriod).toBe(21);
    // Les 5 jours restants sont post-carence (35 h)
    expect(line.sickHoursEmployerPaid + line.sickHoursCpam).toBe(35);
  });

  it("ré-applique la carence pour un nouvel arrêt après un vrai retour au travail", () => {
    // Arrêt 1 : lun-mar (01-02). Retour mer-jeu. Arrêt 2 : ven (05).
    const sick = sickDays(["2026-06-01", "2026-06-02", "2026-06-05"]);
    const line = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 35 }),
      sick,
      MONTH
    );
    // 2 j (arrêt 1) + 1 j (arrêt 2) = 3 j de carence, aucun jour post-carence
    expect(line.sickHoursWaitingPeriod).toBe(21);
    expect(line.sickHoursEmployerPaid + line.sickHoursCpam).toBe(0);
  });
});

describe("computePayrollLine — heures contractuelles respectées", () => {
  it("déclenche des heures sup à 30h mais pas à 35h pour 140h travaillées", () => {
    const work = taskHours(140);
    const at30 = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 30 }),
      work,
      MONTH
    );
    const at35 = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 35 }),
      work,
      MONTH
    );
    // 30h → contrat mensuel 130h → 140h = heures sup
    expect(at30.overtimeHours25 + at30.overtimeHours50).toBeGreaterThan(0);
    // 35h → contrat mensuel 151,67h → 140h < contrat = pas d'heures sup
    expect(at35.overtimeHours25 + at35.overtimeHours50).toBe(0);
  });
});
