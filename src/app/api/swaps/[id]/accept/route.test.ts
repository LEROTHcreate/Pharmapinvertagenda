import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, prismaMock, revalidateTagMock, featureGateMock } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    prismaMock: {
      shiftSwapRequest: { findUnique: vi.fn(), update: vi.fn() },
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

const SESSION = { user: { id: "u-target", role: "EMPLOYEE", pharmacyId: "pharm-1" } };
const CTX = { params: { id: "swap-1" } };
const delReq = () =>
  new Request("http://localhost/api/swaps/swap-1/accept", { method: "POST" });

function pendingSwap(over: Record<string, unknown> = {}) {
  return {
    id: "swap-1",
    pharmacyId: "pharm-1",
    targetId: "u-target",
    status: "PENDING_TARGET",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Par défaut feature ACTIVE (gate transparent) pour tester la logique.
  featureGateMock.mockReturnValue(null);
  mockAuth.mockResolvedValue(SESSION);
  prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(pendingSwap());
  prismaMock.shiftSwapRequest.update.mockResolvedValue({ status: "PENDING_ADMIN" });
});

describe("POST /api/swaps/[id]/accept", () => {
  it("503 si la feature shiftSwap est désactivée", async () => {
    featureGateMock.mockReturnValue(
      new Response(JSON.stringify({ error: "FEATURE_DISABLED" }), { status: 503 })
    );
    const res = await POST(delReq(), CTX);
    expect(res.status).toBe(503);
  });

  it("401 sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(delReq(), CTX);
    expect(res.status).toBe(401);
  });

  it("404 si la demande n'existe pas / autre pharmacie", async () => {
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ pharmacyId: "autre" })
    );
    const res = await POST(delReq(), CTX);
    expect(res.status).toBe(404);
  });

  it("403 si ce n'est pas la cible qui accepte", async () => {
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ targetId: "qqn-dautre" })
    );
    const res = await POST(delReq(), CTX);
    expect(res.status).toBe(403);
  });

  it("409 si la demande n'est plus en attente cible", async () => {
    prismaMock.shiftSwapRequest.findUnique.mockResolvedValue(
      pendingSwap({ status: "APPROVED" })
    );
    const res = await POST(delReq(), CTX);
    expect(res.status).toBe(409);
  });

  it("200 → passe en PENDING_ADMIN", async () => {
    const res = await POST(delReq(), CTX);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("PENDING_ADMIN");
    expect(prismaMock.shiftSwapRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING_ADMIN" }),
      })
    );
  });
});
