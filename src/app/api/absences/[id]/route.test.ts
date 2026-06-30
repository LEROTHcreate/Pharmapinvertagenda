import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks hoistés ────────────────────────────────────────────────────────
// Cible : l'orchestration métier de PATCH (validation/refus d'absence par un
// TITULAIRE) et DELETE (annulation) sans BDD ni envoi d'email réel.
const { mockAuth, prismaMock, revalidateTagMock, emailMock } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  prismaMock: {
    employee: { findUnique: vi.fn() },
    absenceRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  revalidateTagMock: vi.fn(),
  emailMock: { approved: vi.fn(), rejected: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));
vi.mock("@/lib/email", () => ({
  sendAbsenceApprovedEmail: emailMock.approved,
  sendAbsenceRejectedEmail: emailMock.rejected,
}));

import { PATCH, DELETE } from "./route";

// ─── Helpers ──────────────────────────────────────────────────────────────
// Un admin TITULAIRE (a un employeeId + l'employee a le statut TITULAIRE).
const TITULAIRE_SESSION = {
  user: { id: "u1", role: "ADMIN", pharmacyId: "pharm-1", employeeId: "emp-titu" },
};
const CTX = { params: { id: "abs-1" } };

function req(body?: unknown): Request {
  return new Request("http://localhost/api/absences/abs-1", {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** AbsenceRequest PENDING par défaut. */
function pendingRequest(over: Record<string, unknown> = {}) {
  return {
    id: "abs-1",
    pharmacyId: "pharm-1",
    employeeId: "emp-9",
    status: "PENDING",
    absenceCode: "CONGE",
    dateStart: new Date("2026-06-29T00:00:00Z"),
    dateEnd: new Date("2026-06-30T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(TITULAIRE_SESSION);
  // employee.findUnique : reviewer (select.status) vs collaborateur (select.firstName)
  prismaMock.employee.findUnique.mockImplementation((args?: { select?: { firstName?: boolean } }) => {
    if (args?.select?.firstName) {
      return Promise.resolve({
        firstName: "Jean",
        lastName: "Dupont",
        user: { email: "jean@ex.fr" },
      });
    }
    return Promise.resolve({ status: "TITULAIRE" }); // reviewer
  });
  prismaMock.absenceRequest.findUnique.mockResolvedValue(pendingRequest());
  prismaMock.absenceRequest.update.mockResolvedValue({});
  // Transition atomique : updateMany renvoie count=1 (demande claimée).
  prismaMock.absenceRequest.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.absenceRequest.delete.mockResolvedValue({});
  // $transaction(cb) → exécute le callback avec un tx mocké
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      scheduleEntry: {
        findMany: vi.fn().mockResolvedValue([
          { id: "se-1", type: "TASK", taskCode: "COMPTOIR" },
          { id: "se-2", type: "TASK", taskCode: "PARAPHARMACIE" },
        ]),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      absenceRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    })
  );
});

describe("PATCH /api/absences/[id] — validation/refus", () => {
  it("401 sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(req({ decision: "APPROVE" }), CTX);
    expect(res.status).toBe(401);
  });

  it("403 si non-ADMIN", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u2", role: "EMPLOYEE", pharmacyId: "pharm-1", employeeId: "e" },
    });
    const res = await PATCH(req({ decision: "APPROVE" }), CTX);
    expect(res.status).toBe(403);
  });

  it("403 si l'admin n'a pas de profil collaborateur (pas titulaire)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", role: "ADMIN", pharmacyId: "pharm-1", employeeId: null },
    });
    const res = await PATCH(req({ decision: "APPROVE" }), CTX);
    expect(res.status).toBe(403);
  });

  it("403 si l'admin n'est pas TITULAIRE (ex. pharmacien)", async () => {
    prismaMock.employee.findUnique.mockImplementation((args?: { select?: { firstName?: boolean } }) =>
      args?.select?.firstName
        ? Promise.resolve({ firstName: "J", lastName: "D", user: { email: "x@y.fr" } })
        : Promise.resolve({ status: "PHARMACIEN" })
    );
    const res = await PATCH(req({ decision: "APPROVE" }), CTX);
    expect(res.status).toBe(403);
  });

  it("400 si payload invalide (decision inconnue)", async () => {
    const res = await PATCH(req({ decision: "MAYBE" }), CTX);
    expect(res.status).toBe(400);
  });

  it("404 si la demande n'existe pas / autre pharmacie", async () => {
    prismaMock.absenceRequest.findUnique.mockResolvedValue(
      pendingRequest({ pharmacyId: "autre" })
    );
    const res = await PATCH(req({ decision: "APPROVE" }), CTX);
    expect(res.status).toBe(404);
  });

  it("409 si la demande a déjà été traitée", async () => {
    prismaMock.absenceRequest.findUnique.mockResolvedValue(
      pendingRequest({ status: "APPROVED" })
    );
    const res = await PATCH(req({ decision: "APPROVE" }), CTX);
    expect(res.status).toBe(409);
  });

  it("REJECT → statut REJECTED, pas de conversion de créneaux", async () => {
    const res = await PATCH(req({ decision: "REJECT", adminNote: "non" }), CTX);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("REJECTED");
    expect(prismaMock.absenceRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
        data: expect.objectContaining({ status: "REJECTED" }),
      })
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("APPROVE → statut APPROVED + convertit les créneaux planning en absence", async () => {
    const res = await PATCH(req({ decision: "APPROVE" }), CTX);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("APPROVED");
    expect(json.convertedSlots).toBe(2);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/absences/[id] — annulation", () => {
  function delReq() {
    return new Request("http://localhost/api/absences/abs-1", { method: "DELETE" });
  }

  it("401 sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(delReq(), CTX);
    expect(res.status).toBe(401);
  });

  it("PENDING : le demandeur peut annuler (delete simple)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u9", role: "EMPLOYEE", pharmacyId: "pharm-1", employeeId: "emp-9" },
    });
    prismaMock.absenceRequest.findUnique.mockResolvedValue(pendingRequest());
    const res = await DELETE(delReq(), CTX);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, restored: 0 });
    expect(prismaMock.absenceRequest.delete).toHaveBeenCalledTimes(1);
  });

  it("PENDING : un tiers ni admin ni demandeur → 403", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u5", role: "EMPLOYEE", pharmacyId: "pharm-1", employeeId: "emp-5" },
    });
    prismaMock.absenceRequest.findUnique.mockResolvedValue(pendingRequest());
    const res = await DELETE(delReq(), CTX);
    expect(res.status).toBe(403);
  });

  it("APPROVED : seul un admin peut annuler (sinon 403)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u9", role: "EMPLOYEE", pharmacyId: "pharm-1", employeeId: "emp-9" },
    });
    prismaMock.absenceRequest.findUnique.mockResolvedValue(
      pendingRequest({ status: "APPROVED" })
    );
    const res = await DELETE(delReq(), CTX);
    expect(res.status).toBe(403);
  });

  it("APPROVED + admin → restaure les créneaux (previousTaskCode) et supprime la demande", async () => {
    prismaMock.absenceRequest.findUnique.mockResolvedValue(
      pendingRequest({ status: "APPROVED" })
    );
    // tx : 1 créneau restaurable (previousTaskCode) + 1 à effacer (null)
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        scheduleEntry: {
          findMany: vi.fn().mockResolvedValue([
            { id: "se-1", previousTaskCode: "COMPTOIR" },
            { id: "se-2", previousTaskCode: null },
          ]),
          update: vi.fn().mockResolvedValue({}),
          delete: vi.fn().mockResolvedValue({}),
        },
        absenceRequest: { delete: vi.fn().mockResolvedValue({}) },
      })
    );
    const res = await DELETE(delReq(), CTX);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, restored: 1, cleared: 1 });
  });

  it("REJECTED → non annulable (409)", async () => {
    prismaMock.absenceRequest.findUnique.mockResolvedValue(
      pendingRequest({ status: "REJECTED" })
    );
    const res = await DELETE(delReq(), CTX);
    expect(res.status).toBe(409);
  });
});
