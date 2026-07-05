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
    overtimeReference: "WEEKLY",
    payMode: "HOURLY",
    hourlyGrossRate: null,
    monthlyGrossSalary: null,
    coefficient: null,
    hireDate: null,
    ...partial,
  };
}

/** Génère `slotsPerDay` créneaux TASK sur une liste de dates ISO (pour tester
 *  des semaines de volumes différents). */
function tasksOn(dates: Array<{ date: string; hours: number }>): ScheduleEntryDTO[] {
  const out: ScheduleEntryDTO[] = [];
  dates.forEach(({ date, hours }, di) => {
    const slots = Math.round(hours * 2);
    for (let s = 0; s < slots; s++) {
      out.push({
        id: `w${di}-${s}`,
        employeeId: "e",
        date,
        timeSlot: "08:00",
        type: ScheduleType.TASK,
        taskCode: "COMPTOIR" as TaskCode,
        absenceCode: null,
        notes: null,
      });
    }
  });
  return out;
}

describe("computePayrollLine — heures sup à la QUINZAINE (BIWEEKLY)", () => {
  // 40 h une semaine + 30 h la suivante = 70 h sur 2 semaines = contrat (35×2).
  const work = tasksOn([
    { date: "2026-06-01", hours: 40 }, // semaine 1 (lundi)
    { date: "2026-06-08", hours: 30 }, // semaine 2 (lundi)
  ]);

  it("en HEBDO : la semaine à 40 h génère 5 h sup à +25 %", () => {
    const line = computePayrollLine(
      emp({
        payMode: "HOURLY",
        hourlyGrossRate: 15,
        weeklyHours: 35,
        overtimeReference: "WEEKLY",
      }),
      work,
      MONTH
    );
    expect(line.overtimeHours25).toBeCloseTo(5, 5);
    expect(line.overtimeHours50).toBe(0);
  });

  it("en QUINZAINE : 40 h + 30 h = 0 heure sup (lissé sur 2 semaines)", () => {
    const line = computePayrollLine(
      emp({
        payMode: "HOURLY",
        hourlyGrossRate: 15,
        weeklyHours: 35,
        overtimeReference: "BIWEEKLY",
      }),
      work,
      MONTH
    );
    expect(line.overtimeHours25 + line.overtimeHours50).toBe(0);
    expect(line.overtimeReference).toBe("BIWEEKLY");
  });

  it("en QUINZAINE : une semaine à 75 h dépasse le seuil quinzaine (70 h) → 5 h sup", () => {
    const line = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 15, weeklyHours: 35, overtimeReference: "BIWEEKLY" }),
      tasksOn([{ date: "2026-06-01", hours: 75 }]),
      MONTH
    );
    // 75 − 70 (2×35) = 5 h, sous le plafond +25 % (16 h) → tout à +25 %.
    expect(line.overtimeHours25).toBeCloseTo(5, 5);
    expect(line.overtimeHours50).toBe(0);
  });
});

describe("computePayrollLine — cadre & exonérations heures sup", () => {
  it("un pharmacien (cadre) cotise plus qu'un préparateur au même brut", () => {
    const work = taskHours(100); // 25h/sem → pas d'HS, même brut
    const prep = computePayrollLine(
      emp({ status: "PREPARATEUR", payMode: "HOURLY", hourlyGrossRate: 20, weeklyHours: 35 }),
      work,
      MONTH
    );
    const pharm = computePayrollLine(
      emp({ status: "PHARMACIEN", payMode: "HOURLY", hourlyGrossRate: 20, weeklyHours: 35 }),
      work,
      MONTH
    );
    expect(pharm.isCadre).toBe(true);
    expect(prep.isCadre).toBe(false);
    expect(pharm.socialContributionsEmployee).toBeGreaterThan(
      prep.socialContributionsEmployee
    );
  });

  it("les HS ouvrent une déduction patronale (1,50 €/h) + une réduction salariale", () => {
    const line = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 20, weeklyHours: 35 }),
      tasksOn([{ date: "2026-06-01", hours: 46 }]), // 11h sup
      MONTH
    );
    const totalHS = line.overtimeHours25 + line.overtimeHours50;
    expect(totalHS).toBeGreaterThan(0);
    expect(line.hsEmployerDeduction).toBeCloseTo(totalHS * 1.5, 5);
    expect(line.hsEmployeeReduction).toBeGreaterThan(0);
  });
});

describe("computePayrollLine — réduction générale (charges selon salaire)", () => {
  it("bas salaire (proche SMIC) : charges patronales réduites (< 42 %)", () => {
    const line = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 12, weeklyHours: 35 }),
      taskHours(140), // 35h/sem → pas d'heures sup
      MONTH
    );
    expect(line.reductionGenerale).toBeGreaterThan(0);
    expect(line.socialContributionsEmployer).toBeLessThan(
      line.grossEmployer * 0.42
    );
  });

  it("salaire élevé (> 1,6 SMIC) : aucune réduction, ~42 %", () => {
    const line = computePayrollLine(
      emp({ payMode: "HOURLY", hourlyGrossRate: 30, weeklyHours: 35 }),
      taskHours(140),
      MONTH
    );
    expect(line.reductionGenerale).toBe(0);
    expect(line.socialContributionsEmployer).toBeCloseTo(
      line.grossEmployer * 0.42,
      1
    );
  });
});

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
