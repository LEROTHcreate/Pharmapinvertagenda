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

    it("ECHANGE et REMPLACEMENT sont universels (échange/remplacement de poste)", () => {
      const roles = [
        "PHARMACIEN", "PREPARATEUR", "ETUDIANT",
        "LIVREUR", "BACK_OFFICE", "SECRETAIRE", "TITULAIRE",
      ] as const;
      for (const r of roles) {
        expect(isTaskAllowed(r, "ECHANGE")).toBe(true);
        expect(isTaskAllowed(r, "REMPLACEMENT")).toBe(true);
      }
    });

    it("MAIL n'est plus proposé à aucun rôle", () => {
      const roles = [
        "PHARMACIEN", "PREPARATEUR", "ETUDIANT",
        "LIVREUR", "BACK_OFFICE", "SECRETAIRE", "TITULAIRE",
      ] as const;
      for (const r of roles) {
        expect(isTaskAllowed(r, "MAIL")).toBe(false);
      }
    });

    it("MISE_A_PRIX (Mail/App/Préparatoire) autorisé seulement au préparateur", () => {
      expect(isTaskAllowed("PREPARATEUR", "MISE_A_PRIX")).toBe(true);
      expect(isTaskAllowed("LIVREUR", "MISE_A_PRIX")).toBe(false);
      expect(isTaskAllowed("BACK_OFFICE", "MISE_A_PRIX")).toBe(false);
      expect(isTaskAllowed("SECRETAIRE", "MISE_A_PRIX")).toBe(false);
      expect(isTaskAllowed("PHARMACIEN", "MISE_A_PRIX")).toBe(false);
    });

    it("MISE_EN_RAYON et VERIFICATION_STOCKS sont réservés au livreur", () => {
      expect(isTaskAllowed("LIVREUR", "MISE_EN_RAYON")).toBe(true);
      expect(isTaskAllowed("LIVREUR", "VERIFICATION_STOCKS")).toBe(true);
      expect(isTaskAllowed("PREPARATEUR", "MISE_EN_RAYON")).toBe(false);
      expect(isTaskAllowed("BACK_OFFICE", "VERIFICATION_STOCKS")).toBe(false);
      expect(isTaskAllowed("SECRETAIRE", "MISE_EN_RAYON")).toBe(false);
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

    it("contient ECHANGE et REMPLACEMENT (universels) mais plus MAIL", () => {
      const tasks = getAllowedTasks("PREPARATEUR");
      expect(tasks).toContain("ECHANGE");
      expect(tasks).toContain("REMPLACEMENT");
      expect(tasks).not.toContain("MAIL");
    });
  });
});
