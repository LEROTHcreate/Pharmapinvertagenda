import { describe, expect, it } from "vitest";
import { getAllowedTasks, isTaskAllowed } from "./role-task-rules";

describe("role-task-rules", () => {
  describe("isTaskAllowed", () => {
    it("autorise le COMPTOIR pour tous les rôles dispensation", () => {
      expect(isTaskAllowed("PHARMACIEN", "COMPTOIR")).toBe(true);
      expect(isTaskAllowed("PREPARATEUR", "COMPTOIR")).toBe(true);
      expect(isTaskAllowed("ETUDIANT", "COMPTOIR")).toBe(true);
      expect(isTaskAllowed("TITULAIRE", "COMPTOIR")).toBe(true);
    });

    it("interdit le COMPTOIR aux rôles non-dispensation", () => {
      expect(isTaskAllowed("LIVREUR", "COMPTOIR")).toBe(false);
      expect(isTaskAllowed("BACK_OFFICE", "COMPTOIR")).toBe(false);
      expect(isTaskAllowed("SECRETAIRE", "COMPTOIR")).toBe(false);
    });

    it("réserve l'ECHANGE aux pharmaciens uniquement", () => {
      expect(isTaskAllowed("PHARMACIEN", "ECHANGE")).toBe(true);
      expect(isTaskAllowed("TITULAIRE", "ECHANGE")).toBe(false);
      expect(isTaskAllowed("PREPARATEUR", "ECHANGE")).toBe(false);
      expect(isTaskAllowed("LIVREUR", "ECHANGE")).toBe(false);
    });

    it("interdit REMPLACEMENT à tous les rôles (retiré du UI)", () => {
      const roles = [
        "PHARMACIEN", "PREPARATEUR", "ETUDIANT",
        "LIVREUR", "BACK_OFFICE", "SECRETAIRE", "TITULAIRE",
      ] as const;
      for (const r of roles) {
        expect(isTaskAllowed(r, "REMPLACEMENT")).toBe(false);
      }
    });

    it("autorise MISE_A_PRIX aux 4 rôles éligibles (préparateur, livreur, back-office, secrétaire)", () => {
      expect(isTaskAllowed("PREPARATEUR", "MISE_A_PRIX")).toBe(true);
      expect(isTaskAllowed("LIVREUR", "MISE_A_PRIX")).toBe(true);
      expect(isTaskAllowed("BACK_OFFICE", "MISE_A_PRIX")).toBe(true);
      expect(isTaskAllowed("SECRETAIRE", "MISE_A_PRIX")).toBe(true);
      expect(isTaskAllowed("PHARMACIEN", "MISE_A_PRIX")).toBe(false);
    });

    it("autorise LIVRAISON au livreur ET au titulaire (couverture en l'absence du livreur)", () => {
      expect(isTaskAllowed("LIVREUR", "LIVRAISON")).toBe(true);
      expect(isTaskAllowed("TITULAIRE", "LIVRAISON")).toBe(true);
      expect(isTaskAllowed("PHARMACIEN", "LIVRAISON")).toBe(false);
      expect(isTaskAllowed("PREPARATEUR", "LIVRAISON")).toBe(false);
    });

    it("FORMATION et HEURES_SUP restent universels", () => {
      const roles = [
        "PHARMACIEN", "PREPARATEUR", "ETUDIANT",
        "LIVREUR", "BACK_OFFICE", "SECRETAIRE", "TITULAIRE",
      ] as const;
      for (const r of roles) {
        expect(isTaskAllowed(r, "FORMATION")).toBe(true);
        expect(isTaskAllowed(r, "HEURES_SUP")).toBe(true);
      }
    });
  });

  describe("getAllowedTasks", () => {
    it("retourne au moins COMPTOIR + universels pour un pharmacien", () => {
      const tasks = getAllowedTasks("PHARMACIEN");
      expect(tasks).toContain("COMPTOIR");
      expect(tasks).toContain("ECHANGE");
      expect(tasks).toContain("FORMATION");
      expect(tasks).toContain("HEURES_SUP");
    });

    it("ne contient pas REMPLACEMENT", () => {
      const tasks = getAllowedTasks("PREPARATEUR");
      expect(tasks).not.toContain("REMPLACEMENT");
    });
  });
});
