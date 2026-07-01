import { describe, expect, it } from "vitest";
import {
  ABSENCE_PAY_RULES,
  computeAbsencePayImpact,
} from "@/lib/absence-payroll";

describe("ABSENCE_PAY_RULES", () => {
  it("couvre les 4 codes d'absence avec le bon traitement", () => {
    expect(ABSENCE_PAY_RULES.CONGE.treatment).toBe("PAID");
    expect(ABSENCE_PAY_RULES.CONGE.consumesPaidLeave).toBe(true);
    expect(ABSENCE_PAY_RULES.FORMATION_ABS.treatment).toBe("PAID");
    expect(ABSENCE_PAY_RULES.MALADIE.treatment).toBe("INDEMNIFIED");
    expect(ABSENCE_PAY_RULES.ABSENT.treatment).toBe("UNPAID");
  });
});

describe("computeAbsencePayImpact", () => {
  it("renvoie tout à zéro sans absence", () => {
    const r = computeAbsencePayImpact({}, 15);
    expect(r).toMatchObject({
      paidHours: 0,
      indemnifiedHours: 0,
      unpaidHours: 0,
      salaryDeduction: 0,
      paidLeaveHours: 0,
    });
    expect(r.lines).toHaveLength(0);
  });

  it("congé payé : rémunéré, aucune retenue, décompte le solde CP", () => {
    const r = computeAbsencePayImpact({ CONGE: 14 }, 15);
    expect(r.paidHours).toBe(14);
    expect(r.paidLeaveHours).toBe(14);
    expect(r.salaryDeduction).toBe(0);
    expect(r.lines[0]).toMatchObject({
      code: "CONGE",
      treatment: "PAID",
      amount: 0,
    });
  });

  it("absence non justifiée : retenue = heures × taux horaire", () => {
    const r = computeAbsencePayImpact({ ABSENT: 7 }, 15);
    expect(r.unpaidHours).toBe(7);
    expect(r.salaryDeduction).toBe(105);
    expect(r.paidLeaveHours).toBe(0);
    expect(r.lines[0]).toMatchObject({ code: "ABSENT", amount: -105 });
  });

  it("maladie : indemnisée, pas de retenue employeur par défaut", () => {
    const r = computeAbsencePayImpact({ MALADIE: 21 }, 15);
    expect(r.indemnifiedHours).toBe(21);
    expect(r.salaryDeduction).toBe(0);
    expect(r.lines[0]).toMatchObject({ code: "MALADIE", treatment: "INDEMNIFIED" });
  });

  it("mélange de codes : agrège par traitement et ordonne l'affichage", () => {
    const r = computeAbsencePayImpact(
      { ABSENT: 3.5, CONGE: 7, MALADIE: 3.5, FORMATION_ABS: 3.5 },
      20
    );
    expect(r.paidHours).toBe(10.5); // CONGE 7 + FORMATION_ABS 3.5
    expect(r.indemnifiedHours).toBe(3.5);
    expect(r.unpaidHours).toBe(3.5);
    expect(r.salaryDeduction).toBe(70); // 3.5 × 20
    expect(r.paidLeaveHours).toBe(7); // seul CONGE
    // Ordre : CONGE, FORMATION_ABS, MALADIE, ABSENT
    expect(r.lines.map((l) => l.code)).toEqual([
      "CONGE",
      "FORMATION_ABS",
      "MALADIE",
      "ABSENT",
    ]);
  });

  it("taux horaire ≤ 0 → aucune retenue chiffrée", () => {
    const r = computeAbsencePayImpact({ ABSENT: 10 }, 0);
    expect(r.unpaidHours).toBe(10);
    expect(r.salaryDeduction).toBe(0);
    expect(r.lines[0].amount).toBe(0);
  });

  it("arrondit la retenue à 2 décimales", () => {
    const r = computeAbsencePayImpact({ ABSENT: 3.5 }, 15.333);
    expect(r.salaryDeduction).toBe(53.67); // 3.5 × 15.333 = 53.6655 → 53.67
  });
});