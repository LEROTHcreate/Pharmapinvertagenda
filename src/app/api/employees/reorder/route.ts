import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { canManageTeam } from "@/lib/permissions";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/employees/reorder
 * Body : { orderedIds: string[] }
 *
 * Met à jour le `displayOrder` des collaborateurs selon l'ordre fourni
 * (premier id = position 0, etc.). Réservé aux ADMIN.
 *
 * Multi-tenant : tous les ids doivent appartenir à la pharmacie de la
 * session — sinon rejet 400 (sans dévoiler quel id est étranger).
 */
const inputSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canManageTeam(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { orderedIds } = parsed.data;

  // Anti-doublon : si un id apparaît deux fois, l'ordre serait incohérent.
  const unique = new Set(orderedIds);
  if (unique.size !== orderedIds.length) {
    return NextResponse.json({ error: "duplicate_ids" }, { status: 400 });
  }

  // Vérifie que tous les ids appartiennent à la pharmacie de la session.
  const found = await prisma.employee.findMany({
    where: { id: { in: orderedIds }, pharmacyId: session.user.pharmacyId },
    select: { id: true },
  });
  if (found.length !== orderedIds.length) {
    return NextResponse.json({ error: "invalid_ids" }, { status: 400 });
  }

  // Une seule transaction pour appliquer tout l'ordre — évite des états
  // intermédiaires si un autre admin réordonne en parallèle.
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.employee.update({
        where: { id },
        data: { displayOrder: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling(POST__impl);
