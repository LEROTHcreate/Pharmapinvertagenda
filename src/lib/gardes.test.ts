import { describe, it, expect } from "vitest";
import {
  gardeCounts,
  gardeEquity,
  suggestNextGarde,
  totalIndemnites,
  GARDE_RATES_PLACEHOLDER,
  type Garde,
} from "./gardes";

const PH = ["a", "b", "c"]; // 3 pharmaciens
let uid = 0;
const g = (pharmacistId: string, date: string, type: Garde["type"]): Garde => ({
  id: `g${uid++}`,
  pharmacistId,
  date,
  type,
});

describe("gardeCounts", () => {
  it("compte par pharmacien (y compris ceux à 0) et trie du moins au plus chargé", () => {
    const gardes = [
      g("a", "2026-06-07", "DIMANCHE"),
      g("a", "2026-06-14", "DIMANCHE"),
      g("b", "2026-06-21", "NUIT"),
    ];
    const c = gardeCounts(gardes, PH);
    expect(c.map((x) => x.pharmacistId)).toEqual(["c", "b", "a"]); // 0, 1, 2
    expect(c.find((x) => x.pharmacistId === "a")?.total).toBe(2);
    expect(c.find((x) => x.pharmacistId === "a")?.byType.DIMANCHE).toBe(2);
    expect(c.find((x) => x.pharmacistId === "c")?.total).toBe(0);
  });

  it("respecte la borne de période", () => {
    const gardes = [
      g("a", "2026-05-01", "NUIT"),
      g("a", "2026-06-15", "NUIT"),
    ];
    const c = gardeCounts(gardes, PH, { from: "2026-06-01", to: "2026-06-30" });
    expect(c.find((x) => x.pharmacistId === "a")?.total).toBe(1);
  });
});

describe("gardeEquity", () => {
  it("calcule moyenne, écart, moins/plus chargés", () => {
    const gardes = [
      g("a", "2026-06-07", "DIMANCHE"),
      g("a", "2026-06-14", "DIMANCHE"),
      g("b", "2026-06-21", "NUIT"),
    ];
    const e = gardeEquity(gardes, PH);
    expect(e.average).toBeCloseTo(1); // (2+1+0)/3
    expect(e.spread).toBe(2);
    expect(e.leastLoaded).toEqual(["c"]);
    expect(e.mostLoaded).toEqual(["a"]);
  });
});

describe("suggestNextGarde", () => {
  it("propose le(s) pharmacien(s) le(s) moins chargé(s)", () => {
    const gardes = [g("a", "2026-06-07", "DIMANCHE")];
    // b et c sont à 0 → tous deux candidats
    expect(suggestNextGarde(gardes, PH).sort()).toEqual(["b", "c"]);
  });

  it("exclut les pharmaciens indisponibles", () => {
    const gardes = [g("a", "2026-06-07", "DIMANCHE")];
    expect(suggestNextGarde(gardes, PH, { excludeIds: ["c"] })).toEqual(["b"]);
  });
});

describe("totalIndemnites", () => {
  it("somme les indemnités par type et par pharmacien", () => {
    const gardes = [
      g("a", "2026-06-07", "DIMANCHE"), // 100
      g("a", "2026-06-08", "NUIT"), // 150
      g("b", "2026-06-21", "JOUR_FERIE"), // 120
    ];
    const r = totalIndemnites(gardes, GARDE_RATES_PLACEHOLDER);
    expect(r.total).toBe(370);
    expect(r.byPharmacist.a).toBe(250);
    expect(r.byPharmacist.b).toBe(120);
  });
});
