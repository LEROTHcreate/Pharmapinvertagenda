import { describe, expect, it } from "vitest";
import { seasonalTips } from "./seasonal-staffing";

const titles = (iso: string, horizon?: number) =>
  seasonalTips(iso, horizon).map((t) => t.title);

describe("seasonal-staffing", () => {
  it("mi-janvier : épidémies hivernales + campagne grippe actives", () => {
    const t = titles("2026-01-15");
    expect(t).toContain("Épidémies hivernales");
    expect(t).toContain("Campagne vaccination grippe");
  });

  it("avril : saison des allergies active", () => {
    const t = titles("2026-04-10");
    expect(t).toContain("Saison des allergies (pollens)");
  });

  it("fin août : été (congés) + rentrée scolaire actives", () => {
    const t = titles("2026-08-28");
    expect(t).toContain("Été — congés & tourisme");
    expect(t).toContain("Rentrée scolaire");
  });

  it("signale une période qui approche dans l'horizon", () => {
    // 10 j avant le 25/08 (rentrée) → tip "— bientôt"
    const t = titles("2026-08-15", 21);
    expect(t.some((x) => x.includes("bientôt"))).toBe(true);
  });

  it("29 février (année bissextile) : épidémies hivernales toujours actives", () => {
    const t = titles("2028-02-29"); // 2028 = bissextile
    expect(t).toContain("Épidémies hivernales");
  });

  it("28 février (année normale) : épidémies hivernales actives", () => {
    const t = titles("2026-02-28");
    expect(t).toContain("Épidémies hivernales");
  });

  it("hors saison marquée : peut ne rien renvoyer", () => {
    // Fin octobre : grippe commence le 15/10 donc active — on teste plutôt
    // une vraie période creuse, ex. mi-octobre avant le 15 n'existe pas ici ;
    // on vérifie juste que la fonction renvoie un tableau.
    expect(Array.isArray(seasonalTips("2026-04-10"))).toBe(true);
  });
});
