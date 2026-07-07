import { describe, expect, it } from "vitest";
import type { ContractType } from "@prisma/client";
import { shouldBeInactive } from "./employee-lifecycle";

const TODAY = "2026-07-07";

function emp(p: {
  isActive?: boolean;
  contractType?: ContractType;
  contractEndDate?: Date | string | null;
  departureDate?: Date | string | null;
}) {
  return {
    isActive: p.isActive ?? true,
    contractType: p.contractType ?? "CDI",
    contractEndDate: p.contractEndDate ?? null,
    departureDate: p.departureDate ?? null,
  };
}

describe("shouldBeInactive", () => {
  it("laisse actif un CDI sans échéance", () => {
    expect(shouldBeInactive(emp({}), TODAY)).toBe(false);
  });

  it("désactive au passage de la date de départ (aujourd'hui inclus)", () => {
    expect(shouldBeInactive(emp({ departureDate: TODAY }), TODAY)).toBe(true);
    expect(shouldBeInactive(emp({ departureDate: "2026-07-06" }), TODAY)).toBe(
      true
    );
  });

  it("ne désactive pas avant la date de départ", () => {
    expect(shouldBeInactive(emp({ departureDate: "2026-07-08" }), TODAY)).toBe(
      false
    );
  });

  it("désactive un CDD dont la fin de contrat est passée (non renouvelé)", () => {
    expect(
      shouldBeInactive(
        emp({ contractType: "CDD", contractEndDate: "2026-07-06" }),
        TODAY
      )
    ).toBe(true);
  });

  it("garde actif un CDD le jour même de la fin (renouvellement possible)", () => {
    expect(
      shouldBeInactive(
        emp({ contractType: "CDD", contractEndDate: TODAY }),
        TODAY
      )
    ).toBe(false);
  });

  it("garde actif un CDD dont la fin est future", () => {
    expect(
      shouldBeInactive(
        emp({ contractType: "CDD", contractEndDate: "2026-08-01" }),
        TODAY
      )
    ).toBe(false);
  });

  it("ignore une contractEndDate passée si le contrat est un CDI", () => {
    expect(
      shouldBeInactive(
        emp({ contractType: "CDI", contractEndDate: "2020-01-01" }),
        TODAY
      )
    ).toBe(false);
  });

  it("s'applique aussi aux stages/intérim/apprentissage", () => {
    for (const t of ["STAGE", "INTERIM", "APPRENTISSAGE"] as ContractType[]) {
      expect(
        shouldBeInactive(
          emp({ contractType: t, contractEndDate: "2026-07-01" }),
          TODAY
        )
      ).toBe(true);
    }
  });

  it("la période d'essai ne déclenche jamais la désactivation", () => {
    // Pas de champ trialEndDate → on vérifie qu'aucune autre échéance ne suffit.
    expect(shouldBeInactive(emp({ contractType: "CDD" }), TODAY)).toBe(false);
  });

  it("ne touche pas un collaborateur déjà inactif", () => {
    expect(
      shouldBeInactive(emp({ isActive: false, departureDate: TODAY }), TODAY)
    ).toBe(false);
  });

  it("accepte les objets Date (pas seulement les strings ISO)", () => {
    expect(
      shouldBeInactive(
        emp({ departureDate: new Date("2026-07-06T00:00:00Z") }),
        TODAY
      )
    ).toBe(true);
  });
});
