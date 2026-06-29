import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks hoistés ────────────────────────────────────────────────────────
// Cible : la logique métier d'apply-batch sans BDD ni NextAuth. On vérifie
// surtout les SKIPS silencieux (employé inactif / changement de statut rendant
// le poste incompatible / absence approuvée qui prime sur le gabarit), car
// c'est la règle subtile de CLAUDE.md la plus facile à casser sans s'en rendre
// compte.
const { mockAuth, prismaMock, prismaDirectMock, revalidateTagMock } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    prismaMock: {
      weekTemplate: { findFirst: vi.fn() },
      employee: { findMany: vi.fn() },
      absenceRequest: { findMany: vi.fn() },
    },
    prismaDirectMock: {
      scheduleEntry: { deleteMany: vi.fn(), createMany: vi.fn() },
      absenceRequest: { deleteMany: vi.fn() },
    },
    revalidateTagMock: vi.fn(),
  })
);

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
  prismaDirect: prismaDirectMock,
}));
vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));

// Silence les console.time/log de perf de la route pendant les tests.
vi.spyOn(console, "time").mockImplementation(() => {});
vi.spyOn(console, "timeEnd").mockImplementation(() => {});

import { POST } from "./route";

// ─── Helpers ──────────────────────────────────────────────────────────────
const ADMIN_SESSION = { user: { role: "ADMIN", pharmacyId: "pharm-1", id: "u1" } };

// 2026-06-29 = lundi, semaine ISO 27 (IMPAIRE → S1). On applique un seul
// gabarit S1 sur 1 semaine : déterministe, pas de dépendance à Date.now.
const WEEK_START = "2026-06-29";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/templates/apply-batch", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Entrée de gabarit. dayOfWeek 0 = lundi (= 2026-06-29 pour WEEK_START). */
function tplEntry(over: Partial<Record<string, unknown>> = {}) {
  return {
    employeeId: "emp-1",
    dayOfWeek: 0,
    timeSlot: "08:30",
    type: "TASK",
    taskCode: "COMPTOIR",
    absenceCode: null,
    ...over,
  };
}

function s1Template(entries: ReturnType<typeof tplEntry>[]) {
  return {
    id: "tpl-s1",
    pharmacyId: "pharm-1",
    weekType: "S1",
    name: "Semaine type 1",
    entries,
  };
}

/** Corps minimal : applique le gabarit S1 sur 1 semaine. */
function batchBody(over: Partial<Record<string, unknown>> = {}) {
  return { s1TemplateId: "tpl-s1", weekStart: WEEK_START, weeks: 1, ...over };
}

// État ajustable par test pour les deux appels distincts à employee.findMany :
//  - 1er appel (where.isActive) → collaborateurs actifs {id,status}
//  - 2e appel (where.id.in)     → noms pour le récap absences {id,firstName}
let activeEmployees: Array<{ id: string; status: string }> = [];
let employeeNames: Array<{ id: string; firstName: string }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(ADMIN_SESSION);
  activeEmployees = [{ id: "emp-1", status: "PHARMACIEN" }];
  employeeNames = [];
  prismaMock.employee.findMany.mockImplementation(
    (args?: { where?: { isActive?: boolean } }) => {
      if (args?.where?.isActive) return Promise.resolve(activeEmployees);
      return Promise.resolve(employeeNames);
    }
  );
  prismaMock.absenceRequest.findMany.mockResolvedValue([]);
  prismaDirectMock.scheduleEntry.deleteMany.mockResolvedValue({ count: 0 });
  prismaDirectMock.scheduleEntry.createMany.mockResolvedValue({ count: 0 });
  prismaDirectMock.absenceRequest.deleteMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/templates/apply-batch", () => {
  describe("authentification & autorisation", () => {
    it("401 si pas de session", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await POST(postRequest(batchBody()));
      expect(res.status).toBe(401);
    });

    it("403 si non-ADMIN", async () => {
      mockAuth.mockResolvedValue({
        user: { role: "EMPLOYEE", pharmacyId: "pharm-1", id: "u2" },
      });
      const res = await POST(postRequest(batchBody()));
      expect(res.status).toBe(403);
    });
  });

  describe("validation & ownership des gabarits", () => {
    it("400 si aucun gabarit (S1/S2) fourni", async () => {
      const res = await POST(
        postRequest({ weekStart: WEEK_START, weeks: 1 })
      );
      expect(res.status).toBe(400);
    });

    it("404 si le gabarit S1 est introuvable (ou autre pharmacie)", async () => {
      prismaMock.weekTemplate.findFirst.mockResolvedValue(null);
      const res = await POST(postRequest(batchBody()));
      const json = await res.json();
      expect(res.status).toBe(404);
      expect(json.error).toContain("S1");
    });

    it("charge le gabarit en filtrant sur la pharmacie de la session", async () => {
      prismaMock.weekTemplate.findFirst.mockResolvedValue(
        s1Template([tplEntry()])
      );
      await POST(postRequest(batchBody()));
      expect(prismaMock.weekTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "tpl-s1",
            pharmacyId: "pharm-1",
            weekType: "S1",
          }),
        })
      );
    });
  });

  describe("skips silencieux (règle CLAUDE.md)", () => {
    it("skippedInactive : ignore une entrée dont l'employé n'est plus actif", async () => {
      activeEmployees = []; // emp-1 désactivé
      prismaMock.weekTemplate.findFirst.mockResolvedValue(
        s1Template([tplEntry()])
      );
      const res = await POST(postRequest(batchBody()));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.skippedInactive).toBe(1);
      expect(json.applied).toBe(0);
      // Lot vide → la boucle de chunks ne tourne pas, aucun INSERT émis.
      expect(prismaDirectMock.scheduleEntry.createMany).not.toHaveBeenCalled();
    });

    it("skippedIncompatible : ignore un poste devenu interdit après changement de statut", async () => {
      // emp-1 est désormais PHARMACIEN ; le gabarit lui demande PARAPHARMACIE
      // (autorisé seulement préparateur/titulaire) → doit être ignoré.
      activeEmployees = [{ id: "emp-1", status: "PHARMACIEN" }];
      prismaMock.weekTemplate.findFirst.mockResolvedValue(
        s1Template([tplEntry({ taskCode: "PARAPHARMACIE" })])
      );
      const res = await POST(postRequest(batchBody()));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.skippedIncompatible).toBe(1);
      expect(json.applied).toBe(0);
    });

    it("applique un poste compatible et l'insère avec le bon pharmacyId/date", async () => {
      prismaMock.weekTemplate.findFirst.mockResolvedValue(
        s1Template([tplEntry({ taskCode: "COMPTOIR" })])
      );
      const res = await POST(postRequest(batchBody()));
      const json = await res.json();
      expect(json.applied).toBe(1);
      const createArg =
        prismaDirectMock.scheduleEntry.createMany.mock.calls[0][0];
      expect(createArg.data).toHaveLength(1);
      expect(createArg.data[0]).toMatchObject({
        pharmacyId: "pharm-1",
        employeeId: "emp-1",
        timeSlot: "08:30",
        type: "TASK",
        taskCode: "COMPTOIR",
        absenceCode: null,
      });
      // dayOfWeek 0 = lundi = WEEK_START
      expect(createArg.data[0].date.toISOString().slice(0, 10)).toBe(WEEK_START);
    });

    it("skippedAbsence : un congé approuvé prime sur le gabarit + remonte dans absenceConflicts", async () => {
      prismaMock.weekTemplate.findFirst.mockResolvedValue(
        s1Template([tplEntry()])
      );
      prismaMock.absenceRequest.findMany.mockResolvedValue([
        {
          employeeId: "emp-1",
          dateStart: new Date(`${WEEK_START}T00:00:00Z`),
          dateEnd: new Date(`${WEEK_START}T00:00:00Z`),
        },
      ]);
      employeeNames = [{ id: "emp-1", firstName: "Jean" }];
      const res = await POST(postRequest(batchBody()));
      const json = await res.json();
      expect(json.skippedAbsence).toBe(1);
      expect(json.applied).toBe(0);
      expect(json.absenceConflicts).toEqual([
        { employeeId: "emp-1", employeeName: "Jean", days: 1 },
      ]);
    });

    it("deleteAbsences court-circuite le blocage absence (le créneau s'applique)", async () => {
      prismaMock.weekTemplate.findFirst.mockResolvedValue(
        s1Template([tplEntry()])
      );
      prismaMock.absenceRequest.findMany.mockResolvedValue([
        {
          employeeId: "emp-1",
          dateStart: new Date(`${WEEK_START}T00:00:00Z`),
          dateEnd: new Date(`${WEEK_START}T00:00:00Z`),
        },
      ]);
      const res = await POST(
        postRequest(batchBody({ deleteAbsences: true }))
      );
      const json = await res.json();
      // Avec deleteAbsences, on ne consulte même pas les absences pour bloquer
      expect(prismaMock.absenceRequest.findMany).not.toHaveBeenCalled();
      expect(json.skippedAbsence).toBe(0);
      expect(json.applied).toBe(1);
    });
  });

  describe("suppressions optionnelles", () => {
    beforeEach(() => {
      prismaMock.weekTemplate.findFirst.mockResolvedValue(
        s1Template([tplEntry()])
      );
    });

    it("sans overwrite : aucune suppression, createMany en skipDuplicates", async () => {
      await POST(postRequest(batchBody()));
      expect(prismaDirectMock.scheduleEntry.deleteMany).not.toHaveBeenCalled();
      const createArg =
        prismaDirectMock.scheduleEntry.createMany.mock.calls[0][0];
      expect(createArg.skipDuplicates).toBe(true);
    });

    it("overwrite=true : supprime les TASK existants et désactive skipDuplicates", async () => {
      await POST(postRequest(batchBody({ overwrite: true })));
      expect(prismaDirectMock.scheduleEntry.deleteMany).toHaveBeenCalledTimes(1);
      const delArg = prismaDirectMock.scheduleEntry.deleteMany.mock.calls[0][0];
      expect(delArg.where.type.in).toEqual(["TASK"]);
      const createArg =
        prismaDirectMock.scheduleEntry.createMany.mock.calls[0][0];
      expect(createArg.skipDuplicates).toBe(false);
    });

    it("deleteAbsences=true : supprime ABSENCE + les demandes AbsenceRequest", async () => {
      await POST(postRequest(batchBody({ deleteAbsences: true })));
      const delArg = prismaDirectMock.scheduleEntry.deleteMany.mock.calls[0][0];
      expect(delArg.where.type.in).toContain("ABSENCE");
      expect(prismaDirectMock.absenceRequest.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  it("invalide le cache planning de la pharmacie après application", async () => {
    prismaMock.weekTemplate.findFirst.mockResolvedValue(
      s1Template([tplEntry()])
    );
    await POST(postRequest(batchBody()));
    expect(revalidateTagMock).toHaveBeenCalled();
  });
});
