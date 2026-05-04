import { describe, it, expect } from "vitest";
import {
  isWorkingDay,
  consecutiveNonWorkingBefore,
  tipFor,
  upcomingTips,
} from "./planning-tips";

describe("planning-tips", () => {
  describe("isWorkingDay", () => {
    it("retourne false le dimanche", () => {
      expect(isWorkingDay("2026-05-03")).toBe(false); // dim
    });

    it("retourne true du lundi au samedi en jour normal", () => {
      expect(isWorkingDay("2026-05-04")).toBe(true); // lun
      expect(isWorkingDay("2026-05-09")).toBe(true); // sam
    });

    it("retourne false un jour férié", () => {
      expect(isWorkingDay("2026-05-01")).toBe(false); // 1er mai = ven
      expect(isWorkingDay("2026-12-25")).toBe(false); // Noël
    });
  });

  describe("consecutiveNonWorkingBefore", () => {
    it("compte 1 le lundi (dimanche précédent)", () => {
      // 2026-05-04 (lun). Précédent = 03/05 dim. Avant = 02/05 sam (ouvré).
      expect(consecutiveNonWorkingBefore("2026-05-04")).toBe(1);
    });

    it("compte le pont 1er mai (vendredi férié + sam + dim) avant le lundi", () => {
      // 2026-05-04 (lundi) — précédents : dim 03/05, sam 02/05, ven 01/05 (férié)
      // Sam est ouvré, donc le compteur s'arrête. NB: sam est OUVRÉ → seuls
      // dim 03/05 compte (1). Mais on doit attraper le cas où ven est férié.
      // Dans ce cas : avant lun = dim (1 non-ouvré), sam est ouvré → stop.
      // Le pont effectif est sur ven seulement (1 jour férié isolé).
      // Donc consecutiveNonWorkingBefore('2026-05-04') = 1.
      expect(consecutiveNonWorkingBefore("2026-05-04")).toBe(1);
    });

    it("compte les 3 jours de pont avant un lundi de Pâques + 1", () => {
      // 2026-04-06 (lun de Pâques férié) → mardi 07/04 = reprise.
      // Précédents avant mardi : lun 06/04 férié, dim 05/04, sam 04/04 ouvré.
      // → 2 jours non ouvrés avant mardi.
      expect(consecutiveNonWorkingBefore("2026-04-07")).toBe(2);
    });
  });

  describe("tipFor", () => {
    it("ne retourne rien un mardi banal", () => {
      // 2026-09-08 (mardi banal) — précédent lundi est ouvré
      expect(tipFor("2026-09-08")).toBeNull();
    });

    it("flagge la reprise après un pont", () => {
      // Mardi 07/04/2026 = reprise après lun de Pâques (6 avr férié) +
      // dim 5 avr (= 2 jours non ouvrés)
      const tip = tipFor("2026-04-07");
      expect(tip).not.toBeNull();
      expect(tip?.title).toMatch(/Reprise/i);
      expect(tip?.level).toBe("info");
    });

    it("flagge la veille d'un jour férié", () => {
      // 30/04/2026 (jeudi) — veille du 1er mai
      const tip = tipFor("2026-04-30");
      expect(tip).not.toBeNull();
      expect(tip?.title).toMatch(/Veille de/i);
    });

    it("ne retourne rien pour un jour non ouvré", () => {
      expect(tipFor("2026-05-03")).toBeNull(); // dimanche
      expect(tipFor("2026-05-01")).toBeNull(); // 1er mai férié (lui-même)
    });
  });

  describe("upcomingTips", () => {
    it("retourne les tips des 7 prochains jours uniquement", () => {
      // À partir du 28/04/2026 (mardi), on regarde 7 jours :
      //  28/04 mar — banal
      //  29/04 mer — banal
      //  30/04 jeu — VEILLE 1er mai → tip
      //  01/05 ven — férié, lui-même non ouvré
      //  02/05 sam — ouvré, précédent ven est férié (1 jour non ouvré seul) → pas de tip
      //  03/05 dim — non ouvré
      //  04/05 lun — précédent dim (1 jour non ouvré) → pas de tip
      const tips = upcomingTips("2026-04-28", 7);
      expect(tips.length).toBeGreaterThanOrEqual(1);
      expect(tips.some((t) => t.title.includes("Veille de"))).toBe(true);
    });
  });
});
