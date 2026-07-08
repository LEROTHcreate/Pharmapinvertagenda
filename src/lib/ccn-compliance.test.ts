import { describe, it, expect } from "vitest";
import {
  analyzeCcnCompliance,
  buildCcnContext,
  weeklyOvertimeBreakdown,
} from "./ccn-compliance";
import { indexEntriesByEmployee } from "./planning-utils";
import { TIME_SLOTS } from "@/types";
import type { ScheduleEntryDTO } from "@/types";

// Semaine Lun → Sam
const WD = [
  "2026-06-22",
  "2026-06-23",
  "2026-06-24",
  "2026-06-25",
  "2026-06-26",
  "2026-06-27",
];

let uid = 0;
function fill(
  out: ScheduleEntryDTO[],
  empId: string,
  date: string,
  from: string,
  to: string
) {
  for (const s of TIME_SLOTS) {
    if (s >= from && s < to) {
      out.push({
        id: `e${uid++}`,
        employeeId: empId,
        date,
        timeSlot: s,
        type: "TASK",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        taskCode: "COMPTOIR" as any,
        absenceCode: null,
        notes: null,
      });
    }
  }
}
const emp = (id: string) => ({ id, firstName: "Léa" });
const types = (vs: ReturnType<typeof analyzeCcnCompliance>) => vs.map((v) => v.type);

describe("analyzeCcnCompliance", () => {
  it("planning conforme (Lun→Ven, 09:00-12:30 / 14:00-18:00, samedi off) → 0 manquement", () => {
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD.slice(0, 5)) {
      fill(e, "p1", d, "09:00", "12:30");
      fill(e, "p1", d, "14:00", "18:00");
    }
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(v).toEqual([]);
  });

  it("repos quotidien sous le seuil (fin 20:00, reprise 07:30 = 11h30) → erreur REPOS_QUOTIDIEN", () => {
    // NB : dans la grille standard 07:30–20:00, le repos minimal possible entre
    // deux journées est de 11h30 (dernier créneau 19:30→20:00, reprise 07:30) —
    // donc le seuil LÉGAL de 11h ne peut jamais être enfreint. On relève ici le
    // seuil à 12h (accord d'entreprise plus strict) pour vérifier que la règle
    // se DÉCLENCHE bien quand le repos passe sous le minimum configuré.
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "14:00", "20:00");
    fill(e, "p1", WD[1], "07:30", "12:00");
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e), {
      reposQuotidienMin: 12 * 60,
    });
    expect(types(v)).toContain("REPOS_QUOTIDIEN");
    expect(v.find((x) => x.type === "REPOS_QUOTIDIEN")?.severity).toBe("error");
  });

  it("plus de 10h de travail dans la journée → erreur DUREE_MAX_JOUR", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "19:00"); // 11h
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("DUREE_MAX_JOUR");
  });

  it("journée fractionnée en 3 séquences (2 coupures) → COUPURE", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "10:00");
    fill(e, "p1", WD[0], "11:00", "13:00");
    fill(e, "p1", WD[0], "15:00", "17:00");
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("COUPURE");
  });

  it("travail continu > 6h → PAUSE", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "14:30"); // 6h30 continu
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("PAUSE");
  });

  it("6 h PILE sans pause → PAUSE (seuil inclusif, ≥ et non >)", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "14:00"); // exactement 6h00 continu
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).toContain("PAUSE");
  });

  it("≥ 6h MAIS avec une coupure ≥ 20 min → pas de PAUSE", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "08:00", "11:30"); // 3h30
    fill(e, "p1", WD[0], "12:00", "15:00"); // + 3h, coupure 30 min entre les deux
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).not.toContain("PAUSE");
  });

  it("7 jours travaillés d'affilée → erreur REPOS_HEBDO (max 6 consécutifs)", () => {
    const WD7 = [...WD, "2026-06-28"]; // + dimanche
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD7) fill(e, "p1", d, "09:00", "12:00");
    const v = analyzeCcnCompliance([emp("p1")], WD7, indexEntriesByEmployee(e));
    expect(
      v.some((x) => x.type === "REPOS_HEBDO" && x.severity === "error")
    ).toBe(true);
  });

  it("6 jours travaillés mais finissant tôt le samedi → PAS de REPOS_HEBDO (dimanche suffit)", () => {
    // Sam fini à 12:00 : 12:00 → dimanche → ≥ 36 h de repos garanti.
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD) fill(e, "p1", d, "09:00", "12:00");
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(types(v)).not.toContain("REPOS_HEBDO");
  });

  it("6 jours finissant tard le samedi, sans contexte → warning REPOS_HEBDO", () => {
    // 14:00-19:30 tous les jours : samedi finit à 19:30 → repos jusqu'à dimanche
    // soir = 28,5 h < 35 h, et on ignore l'ouverture du lundi → à vérifier.
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD) fill(e, "p1", d, "14:00", "19:30");
    const v = analyzeCcnCompliance([emp("p1")], WD, indexEntriesByEmployee(e));
    expect(v.find((x) => x.type === "REPOS_HEBDO")?.severity).toBe("warning");
  });

  it("6 jours finissant tard + contexte ouverture lundi tôt → erreur REPOS_HEBDO", () => {
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD) fill(e, "p1", d, "14:00", "19:30");
    const ctx = new Map([["p1", { nextWeekFirstStart: 6 * 60 }]]); // lundi 06:00
    const v = analyzeCcnCompliance(
      [emp("p1")],
      WD,
      indexEntriesByEmployee(e),
      {},
      ctx
    );
    // fenêtre = (24h-19:30) + dimanche + 06:00 = 34,5 h < 35 h → illégal
    expect(
      v.some((x) => x.type === "REPOS_HEBDO" && x.severity === "error")
    ).toBe(true);
  });

  it("6 jours finissant tard mais lundi ouvre tard → aucun REPOS_HEBDO", () => {
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD) fill(e, "p1", d, "14:00", "19:30");
    const ctx = new Map([["p1", { nextWeekFirstStart: 10 * 60 }]]); // lundi 10:00
    const v = analyzeCcnCompliance(
      [emp("p1")],
      WD,
      indexEntriesByEmployee(e),
      {},
      ctx
    );
    expect(types(v)).not.toContain("REPOS_HEBDO");
  });

  it("série de jours à cheval sur 2 semaines (contexte) → erreur 7 jours consécutifs", () => {
    // 6 jours cette semaine + 3 jours déjà enchaînés la semaine précédente.
    const e: ScheduleEntryDTO[] = [];
    for (const d of WD) fill(e, "p1", d, "09:00", "12:00");
    const ctx = new Map([["p1", { prevConsecutiveDays: 3 }]]);
    const v = analyzeCcnCompliance(
      [emp("p1")],
      WD,
      indexEntriesByEmployee(e),
      {},
      ctx
    );
    expect(
      v.some(
        (x) =>
          x.type === "REPOS_HEBDO" &&
          x.severity === "error" &&
          /consécutif/.test(x.message)
      )
    ).toBe(true);
  });
});

describe("buildCcnContext", () => {
  it("calcule les jours consécutifs précédents et l'ouverture de la semaine suivante", () => {
    const e: ScheduleEntryDTO[] = [];
    // Semaine précédente : ven 19, sam 20, dim 21 travaillés (3 jours d'affilée
    // se terminant la veille du lundi 22).
    fill(e, "p1", "2026-06-19", "09:00", "12:00");
    fill(e, "p1", "2026-06-20", "09:00", "12:00");
    fill(e, "p1", "2026-06-21", "09:00", "12:00");
    // Semaine suivante : lundi 29 ouvre à 08:00.
    fill(e, "p1", "2026-06-29", "08:00", "12:00");
    const ctx = buildCcnContext(["p1"], WD, indexEntriesByEmployee(e));
    expect(ctx.get("p1")?.prevConsecutiveDays).toBe(3);
    expect(ctx.get("p1")?.nextWeekFirstStart).toBe(8 * 60);
  });

  it("renvoie 0 / null quand aucun jour adjacent n'est travaillé", () => {
    const e: ScheduleEntryDTO[] = [];
    fill(e, "p1", WD[0], "09:00", "12:00");
    const ctx = buildCcnContext(["p1"], WD, indexEntriesByEmployee(e));
    expect(ctx.get("p1")?.prevConsecutiveDays).toBe(0);
    expect(ctx.get("p1")?.nextWeekFirstStart).toBeNull();
  });
});

describe("weeklyOvertimeBreakdown", () => {
  it("35h → aucune heure sup", () => {
    expect(weeklyOvertimeBreakdown(35)).toEqual({
      workedHours: 35,
      normalHours: 35,
      hs25: 0,
      hs50: 0,
    });
  });
  it("40h → 5h à +25%", () => {
    expect(weeklyOvertimeBreakdown(40)).toEqual({
      workedHours: 40,
      normalHours: 35,
      hs25: 5,
      hs50: 0,
    });
  });
  it("48h → 8h à +25% puis 5h à +50%", () => {
    expect(weeklyOvertimeBreakdown(48)).toEqual({
      workedHours: 48,
      normalHours: 35,
      hs25: 8,
      hs50: 5,
    });
  });
});
