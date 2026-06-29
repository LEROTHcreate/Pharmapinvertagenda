import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, prismaMock, revalidateTagMock, featureGateMock } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    prismaMock: {
      shiftSwapRequest: { findUnique: vi.fn(), update: vi.fn() },
      scheduleEntry: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
    revalidateTagMock: vi.fn(),
    featureGateMock: vi.fn(),
  })
);

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));
vi.mock("@/lib/features", () => ({ featureGate: featureGateMock }));

import { POST } from "./route";

const ADMIN = { user: { id: "u-admin", role: "ADMIN", pharmacyId: "pharm-1" } };
const CTX = { params: { id: "swap-1" } };

function req(body: unknown): Request {
  return new Request("http://localhost/api/swaps/swap-1/review", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Swap en attente admin, demandeur PHARMACIEN → cible PHARMACIEN (COMPTOIR ok). */
function pendingAdminSwap(over: Record<string, unknown> = {}) {
  return {
    id: "swap-1",
    pharmacyId: "pharm-1",
    status: "PENDING_ADMIN",
    fullDay: true,
    date: new Date("2026-06-29T00:00:00Z"),
    startTime: null,
    endTime: null,
    requester: { employeeId: "emp-req" },
    target: { employeeId: "emp-tgt", employee: { status: "PHARMACIEN" } },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  featureGateMock.mockReturnValue(null); // feature active
  mockAuth.mockResolvedValue(ADMIN);
  prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(pendingAdminSwap());
  prismaMock.shiftSwapRequest.update.mockResolvedValue({});
  // requester a 1 créneau COMPTOIR ; cible libre
  prismaMock.scheduleEntry.findMany.mockImplementation((args?: { where?: { employeeId?: string } }) => {
    if (args?.where?.employeeId === "emp-req") {
      return Promise.resolve([
        { id: "se-1", date: new Date("2026-06-29T00:00:00Z"), timeSlot: "09:00", type: "TASK", taskCode: "COMPTOIR", notes: null },
      ]);
    }
    return Promise.resolve([]); // cible : aucun créneau existant
  });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      scheduleEntry: { upsert: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
      shiftSwapRequest: { update: vi.fn().mockResolvedValue({}) },
    })
  );
});

describe("POST /api/swaps/[id]/review", () => {
  it("503 si feature désactivée", async () => {
    featureGateMock.mockReturnValue(new Response("{}", { status: 503 }));
    const res = await POST(req({ approve: true }), CTX);
    expect(res.status).toBe(503);
  });

  it("401 sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(req({ approve: true }), CTX);
    expect(res.status).toBe(401);
  });

  it("403 si non-ADMIN", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u", role: "EMPLOYEE", pharmacyId: "pharm-1" } });
    const res = await POST(req({ approve: true }), CTX);
    expect(res.status).toBe(403);
  });

  it("404 si demande introuvable / autre pharmacie", async () => {
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingAdminSwap({ pharmacyId: "autre" })
    );
    const res = await POST(req({ approve: true }), CTX);
    expect(res.status).toBe(404);
  });

  it("409 si la demande n'est pas en attente admin", async () => {
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingAdminSwap({ status: "PENDING_TARGET" })
    );
    const res = await POST(req({ approve: true }), CTX);
    expect(res.status).toBe(409);
  });

  it("refus admin → REJECTED_ADMIN, pas de transfert planning", async () => {
    const res = await POST(req({ approve: false, rejectionNote: "non" }), CTX);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("REJECTED_ADMIN");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("approbation → transfère le créneau compatible, 0 conflit", async () => {
    const res = await POST(req({ approve: true }), CTX);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("APPROVED");
    expect(json.transferred).toBe(1);
    expect(json.conflicts).toHaveLength(0);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("conflit : créneau déjà occupé chez la cible → non transféré", async () => {
    prismaMock.scheduleEntry.findMany.mockImplementation((args?: { where?: { employeeId?: string } }) =>
      args?.where?.employeeId === "emp-req"
        ? Promise.resolve([
            { id: "se-1", date: new Date("2026-06-29T00:00:00Z"), timeSlot: "09:00", type: "TASK", taskCode: "COMPTOIR", notes: null },
          ])
        : Promise.resolve([{ id: "se-x", timeSlot: "09:00" }]) // cible déjà prise à 09:00
    );
    const res = await POST(req({ approve: true }), CTX);
    const json = await res.json();
    expect(json.transferred).toBe(0);
    expect(json.conflicts).toHaveLength(1);
  });

  it("conflit rôle/poste : COMPTOIR vers un LIVREUR → non transféré", async () => {
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingAdminSwap({ target: { employeeId: "emp-tgt", employee: { status: "LIVREUR" } } })
    );
    const res = await POST(req({ approve: true }), CTX);
    const json = await res.json();
    expect(json.transferred).toBe(0);
    expect(json.conflicts).toHaveLength(1);
    expect(json.conflicts[0].reason).toContain("COMPTOIR");
  });

  it("400 si demandeur ou cible sans profil collaborateur", async () => {
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingAdminSwap({ requester: { employeeId: null } })
    );
    const res = await POST(req({ approve: true }), CTX);
    expect(res.status).toBe(400);
  });
});
