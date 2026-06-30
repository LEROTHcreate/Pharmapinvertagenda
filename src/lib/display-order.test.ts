import { describe, it, expect } from "vitest";
import { computeInsertionOrder } from "./display-order";

// Liste de référence : 16 collaborateurs ordonnés 0..15
const IDS = Array.from({ length: 16 }, (_, i) => `e${i}`);

describe("computeInsertionOrder", () => {
  it("insère un nouvel élément en 6 → décale 6..15 vers 7..16", () => {
    const r = computeInsertionOrder([...IDS, "new"], "new", 6);
    expect(r.indexOf("new")).toBe(6);
    // ce qui était en 6 (e6) passe en 7, e7 → 8, etc.
    expect(r[7]).toBe("e6");
    expect(r[8]).toBe("e7");
    expect(r[16]).toBe("e15");
    // les positions 0..5 sont inchangées
    expect(r.slice(0, 6)).toEqual(["e0", "e1", "e2", "e3", "e4", "e5"]);
  });

  it("déplacer un existant de 10 vers 6 décale 6..9 vers 7..10 (et referme le trou)", () => {
    const r = computeInsertionOrder(IDS, "e10", 6);
    expect(r.indexOf("e10")).toBe(6);
    expect(r[5]).toBe("e5");
    expect(r[7]).toBe("e6");
    expect(r[10]).toBe("e9"); // l'ancien 10 est comblé
    expect(r[11]).toBe("e11"); // 11..15 inchangés
    expect(r.length).toBe(16); // aucun doublon, aucune perte
  });

  it("idempotent quand la cible = position actuelle", () => {
    expect(computeInsertionOrder(IDS, "e6", 6)).toEqual(IDS);
  });

  it("borne la position (cible trop grande → fin de liste)", () => {
    const r = computeInsertionOrder(IDS, "e0", 999);
    expect(r[r.length - 1]).toBe("e0");
    expect(r.length).toBe(16);
  });

  it("cible négative ou invalide → position 0", () => {
    expect(computeInsertionOrder(IDS, "e5", -3)[0]).toBe("e5");
    expect(computeInsertionOrder(IDS, "e5", Number.NaN)[0]).toBe("e5");
  });
});
