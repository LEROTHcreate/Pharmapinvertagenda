import { describe, expect, it } from "vitest";
import {
  deadlinesForEmployee,
  upcomingDeadlines,
  type EmployeeDeadlineInput,
} from "./hr-deadlines";

const FROM = "2026-06-30";

function emp(p: Partial<EmployeeDeadlineInput>): EmployeeDeadlineInput {
  return {
    id: "e",
    firstName: "Jean",
    lastName: "Dupont",
    contractType: "CDI",
    contractEndDate: null,
    trialEndDate: null,
    lastMedicalVisitDate: null,
    lastProfessionalInterviewDate: null,
    dpcLastDate: null,
    ...p,
  };
}

describe("hr-deadlines", () => {
  it("CDD : fin de contrat dans la fenêtre → échéance upcoming", () => {
    const d = deadlinesForEmployee(
      emp({ contractType: "CDD", contractEndDate: new Date("2026-07-30") }),
      FROM
    );
    expect(d).toHaveLength(1);
    expect(d[0].kind).toBe("cdd_end");
    expect(d[0].daysUntil).toBe(30);
    expect(d[0].level).toBe("upcoming");
  });

  it("CDI : pas de rappel de fin de contrat même si une date est saisie", () => {
    const d = deadlinesForEmployee(
      emp({ contractType: "CDI", contractEndDate: new Date("2026-07-10") }),
      FROM
    );
    expect(d.find((x) => x.kind === "cdd_end")).toBeUndefined();
  });

  it("période d'essai imminente → soon", () => {
    const d = deadlinesForEmployee(
      emp({ trialEndDate: new Date("2026-07-05") }),
      FROM
    );
    expect(d[0].kind).toBe("trial_end");
    expect(d[0].level).toBe("soon");
  });

  it("entretien professionnel échu (> 2 ans) → overdue", () => {
    const d = deadlinesForEmployee(
      emp({ lastProfessionalInterviewDate: new Date("2024-05-01") }),
      FROM
    );
    expect(d[0].kind).toBe("professional_interview");
    expect(d[0].level).toBe("overdue");
    expect(d[0].daysUntil).toBeLessThan(0);
  });

  it("visite médicale qui arrive dans la fenêtre de rappel", () => {
    const d = deadlinesForEmployee(
      emp({ lastMedicalVisitDate: new Date("2024-08-01") }),
      FROM
    );
    expect(d.some((x) => x.kind === "medical_visit")).toBe(true);
  });

  it("tri global par urgence croissante", () => {
    const all = upcomingDeadlines(
      [
        emp({ id: "a", trialEndDate: new Date("2026-07-05") }), // +5
        emp({ id: "b", lastProfessionalInterviewDate: new Date("2024-05-01") }), // overdue
      ],
      FROM
    );
    expect(all[0].daysUntil).toBeLessThanOrEqual(all[1].daysUntil);
  });
});
