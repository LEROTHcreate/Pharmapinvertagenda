import { describe, expect, it } from "vitest";
import {
  conventionalMinHourly,
  conventionalMinMonthly,
  pointValueAt,
  smicHourlyAt,
} from "./payroll-reference";
import { computeBenchmark } from "./payroll-benchmark";

describe("payroll-reference — valeurs datées", () => {
  it("renvoie la bonne valeur du point selon le mois", () => {
    expect(pointValueAt("2025-01")).toBe(5.158);
    expect(pointValueAt("2025-06")).toBe(5.215); // après accord du 10/03/2025
    expect(pointValueAt("2026-05")).toBe(5.278); // nouvelle classification
  });

  it("renvoie le bon SMIC horaire selon le mois", () => {
    expect(smicHourlyAt("2025-12")).toBe(11.88);
    expect(smicHourlyAt("2026-03")).toBe(12.02); // revalo 01/01/2026
    expect(smicHourlyAt("2026-07")).toBe(12.31); // revalo 01/06/2026
  });
});

describe("payroll-reference — minimum conventionnel", () => {
  it("tombe sur le montant officiel préparateur coeff 250 (1977,40 € @ point 5,215)", () => {
    expect(conventionalMinMonthly(250, "2025-06")).toBeCloseTo(1977.4, 1);
  });

  it("tombe sur le montant officiel pharmacien adjoint coeff 470 (3762,46 € @ point 5,278)", () => {
    expect(conventionalMinMonthly(470, "2026-05")).toBeCloseTo(3762.46, 1);
  });

  it("plancher SMIC pour les petits coefficients (employé coeff 140)", () => {
    // 140 × 5,278 / 100 = 7,39 €/h < SMIC → on retient le SMIC
    expect(conventionalMinHourly(140, "2026-05")).toBe(12.02);
  });
});

describe("payroll-benchmark", () => {
  it("détecte un taux sous le minimum conventionnel", () => {
    const b = computeBenchmark({
      status: "PREPARATEUR",
      hourlyGrossRate: 12.0, // sous le min préparateur coeff 250
      seniorityMonths: 0,
      region: "NATIONAL",
      month: "2026-05",
    });
    expect(b.coefficient).toBe(250);
    expect(b.legal).toBe("below_min");
  });

  it("classe un préparateur bien payé au-dessus du marché", () => {
    const b = computeBenchmark({
      status: "PREPARATEUR",
      hourlyGrossRate: 18,
      seniorityMonths: 0,
      region: "NATIONAL",
      month: "2026-05",
    });
    expect(b.legal).toBe("ok");
    expect(b.market).toBe("above");
  });

  it("applique le multiplicateur régional Île-de-France", () => {
    const national = computeBenchmark({
      status: "PREPARATEUR",
      hourlyGrossRate: 15,
      seniorityMonths: 0,
      region: "NATIONAL",
      month: "2026-05",
    });
    const idf = computeBenchmark({
      status: "PREPARATEUR",
      hourlyGrossRate: 15,
      seniorityMonths: 0,
      region: "IDF",
      month: "2026-05",
    });
    expect(idf.marketHourly!).toBeGreaterThan(national.marketHourly!);
  });
});
