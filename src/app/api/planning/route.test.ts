import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks hoistés ────────────────────────────────────────────────────────
// On isole la route de ses dépendances I/O : auth (session), Prisma (BDD) et
// le cache Next. Objectif : tester l'orchestration métier de POST /api/planning
// (auth → ownership → validation rôle/poste → conflit d'absence → écriture),
// sans toucher à la base ni à NextAuth.
const { mockAuth, prismaMock, prismaDirectMock, revalidateTagMock } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    prismaMock: {
      employee: { findMany: vi.fn() },
      absenceRequest: { findMany: vi.fn() },
    },
    prismaDirectMock: {
      scheduleEntry: { deleteMany: vi.fn(), createMany: vi.fn() },
    },
    revalidateTagMock: vi.fn(),
  })
);

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
  prismaDirect: prismaDirectMock,
}));
vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
  // unstable_cache(fn, ...)() → on renvoie fn directement (pas de cache en test)
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

import { POST } from "./route";

// ─── Helpers ──────────────────────────────────────────────────────────────
const ADMIN_SESSION = {
  user: { role: "ADMIN", pharmacyId: "pharm-1", id: "u1" },
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/planning", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Une entrée TASK valide côté Zod (le code poste reste à fournir). */
function taskEntry(over: Partial<Record<string, unknown>> = {}) {
  return {
    employeeId: "emp-1",
    date: "2026-06-29",
    timeSlot: "08:30",
    type: "TASK",
    taskCode: "COMPTOIR",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Par défaut : admin connecté, aucune absence, écritures qui réussissent.
  mockAuth.mockResolvedValue(ADMIN_SESSION);
  prismaMock.absenceRequest.findMany.mockResolvedValue([]);
  prismaDirectMock.scheduleEntry.deleteMany.mockResolvedValue({ count: 0 });
  prismaDirectMock.scheduleEntry.createMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/planning", () => {
  describe("authentification & autorisation", () => {
    it("401 si pas de session", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await POST(postRequest({ entries: [taskEntry()] }));
      expect(res.status).toBe(401);
    });

    it("403 si l'utilisateur n'est pas ADMIN", async () => {
      mockAuth.mockResolvedValue({
        user: { role: "EMPLOYEE", pharmacyId: "pharm-1", id: "u2" },
      });
      const res = await POST(postRequest({ entries: [taskEntry()] }));
      expect(res.status).toBe(403);
    });
  });

  describe("validation du payload", () => {
    it("400 si le body n'est pas du JSON valide", async () => {
      const req = new Request("http://localhost/api/planning", {
        method: "POST",
        body: "pas du json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("400 si une entrée TASK n'a pas de taskCode (refine Zod)", async () => {
      const res = await POST(
        postRequest({ entries: [taskEntry({ taskCode: undefined })] })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("isolation multi-tenant (ownership)", () => {
    it("400 si un collaborateur n'appartient pas à la pharmacie de l'admin", async () => {
      // L'admin cible emp-1 mais la BDD ne le renvoie pas (autre pharmacie)
      prismaMock.employee.findMany.mockResolvedValue([]);
      const res = await POST(postRequest({ entries: [taskEntry()] }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("collaborateur inconnu");
      // Aucune écriture ne doit avoir lieu
      expect(prismaDirectMock.scheduleEntry.createMany).not.toHaveBeenCalled();
    });

    it("ne lit que les employés de la pharmacie courante", async () => {
      prismaMock.employee.findMany.mockResolvedValue([
        { id: "emp-1", status: "PHARMACIEN" },
      ]);
      await POST(postRequest({ entries: [taskEntry()] }));
      expect(prismaMock.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ pharmacyId: "pharm-1" }),
        })
      );
    });
  });

  describe("validation rôle/poste (cœur métier)", () => {
    it("400 si le poste est interdit pour le rôle (Pharmacien + SECRETARIAT)", async () => {
      prismaMock.employee.findMany.mockResolvedValue([
        { id: "emp-1", status: "PHARMACIEN" },
      ]);
      const res = await POST(
        postRequest({ entries: [taskEntry({ taskCode: "SECRETARIAT" })] })
      );
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain("SECRETARIAT");
      expect(json.error).toContain("PHARMACIEN");
      expect(prismaDirectMock.scheduleEntry.createMany).not.toHaveBeenCalled();
    });

    it("400 si un Livreur est affecté au COMPTOIR", async () => {
      prismaMock.employee.findMany.mockResolvedValue([
        { id: "emp-1", status: "LIVREUR" },
      ]);
      const res = await POST(
        postRequest({ entries: [taskEntry({ taskCode: "COMPTOIR" })] })
      );
      expect(res.status).toBe(400);
    });

    it("200 pour un poste universel (HEURES_SUP) quel que soit le rôle", async () => {
      prismaMock.employee.findMany.mockResolvedValue([
        { id: "emp-1", status: "LIVREUR" },
      ]);
      const res = await POST(
        postRequest({ entries: [taskEntry({ taskCode: "HEURES_SUP" })] })
      );
      expect(res.status).toBe(200);
    });

    it("rejette dès la PREMIÈRE entrée incompatible d'un lot mixte", async () => {
      prismaMock.employee.findMany.mockResolvedValue([
        { id: "emp-1", status: "PREPARATEUR" },
      ]);
      const res = await POST(
        postRequest({
          entries: [
            taskEntry({ taskCode: "COMPTOIR" }), // OK
            taskEntry({ timeSlot: "09:00", taskCode: "LIVRAISON" }), // interdit
          ],
        })
      );
      expect(res.status).toBe(400);
      expect(prismaDirectMock.scheduleEntry.createMany).not.toHaveBeenCalled();
    });
  });

  describe("conflit avec une absence approuvée", () => {
    const conflictAbsence = [
      {
        employeeId: "emp-1",
        dateStart: new Date("2026-06-29T00:00:00Z"),
        dateEnd: new Date("2026-06-29T00:00:00Z"),
        absenceCode: "CONGE",
        employee: { firstName: "Jean", lastName: "Dupont" },
      },
    ];

    beforeEach(() => {
      prismaMock.employee.findMany.mockResolvedValue([
        { id: "emp-1", status: "PHARMACIEN" },
      ]);
    });

    it("409 si on écrit une TASK sur un congé approuvé sans force", async () => {
      prismaMock.absenceRequest.findMany.mockResolvedValue(conflictAbsence);
      const res = await POST(postRequest({ entries: [taskEntry()] }));
      const json = await res.json();
      expect(res.status).toBe(409);
      expect(json.error).toBe("ABSENCE_CONFLICT");
      expect(json.conflicts).toHaveLength(1);
      expect(json.conflicts[0]).toMatchObject({
        employeeId: "emp-1",
        employeeName: "Jean Dupont",
        absenceCode: "CONGE",
      });
      expect(prismaDirectMock.scheduleEntry.createMany).not.toHaveBeenCalled();
    });

    it("200 si force:true outrepasse le conflit d'absence", async () => {
      prismaMock.absenceRequest.findMany.mockResolvedValue(conflictAbsence);
      const res = await POST(
        postRequest({ entries: [taskEntry()], force: true })
      );
      expect(res.status).toBe(200);
      expect(prismaDirectMock.scheduleEntry.createMany).toHaveBeenCalled();
    });
  });

  describe("chemin nominal (écriture)", () => {
    beforeEach(() => {
      prismaMock.employee.findMany.mockResolvedValue([
        { id: "emp-1", status: "PHARMACIEN" },
      ]);
    });

    it("200 et renvoie le nombre d'entrées écrites", async () => {
      const res = await POST(
        postRequest({
          entries: [
            taskEntry(),
            taskEntry({ timeSlot: "09:00" }),
          ],
        })
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json).toEqual({ ok: true, count: 2 });
    });

    it("delete puis create sur les mêmes clés, et invalide le cache", async () => {
      await POST(postRequest({ entries: [taskEntry()] }));
      expect(prismaDirectMock.scheduleEntry.deleteMany).toHaveBeenCalledTimes(1);
      expect(prismaDirectMock.scheduleEntry.createMany).toHaveBeenCalledTimes(1);
      // L'ordre compte : on supprime avant d'insérer
      const deleteOrder =
        prismaDirectMock.scheduleEntry.deleteMany.mock.invocationCallOrder[0];
      const createOrder =
        prismaDirectMock.scheduleEntry.createMany.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(createOrder);
      expect(revalidateTagMock).toHaveBeenCalled();
    });

    it("force le pharmacyId de la session sur les lignes créées (pas celui du client)", async () => {
      await POST(postRequest({ entries: [taskEntry()] }));
      const createArg =
        prismaDirectMock.scheduleEntry.createMany.mock.calls[0][0];
      expect(createArg.data[0]).toMatchObject({
        pharmacyId: "pharm-1",
        employeeId: "emp-1",
        type: "TASK",
        taskCode: "COMPTOIR",
        absenceCode: null,
      });
    });
  });
});
