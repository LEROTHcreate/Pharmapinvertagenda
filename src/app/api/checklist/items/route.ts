import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminLevel } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: "unauthorized" as const, status: 401 };
  if (!isAdminLevel(session.user.role)) {
    return { error: "forbidden" as const, status: 403 };
  }
  return { session };
}

const createInput = z.object({
  label: z.string().trim().min(1).max(120),
  moment: z.enum(["OUVERTURE", "FERMETURE"]),
  needsNote: z.boolean().optional(),
});

/** POST — crée un élément de checklist (titulaires). */
async function POST__impl(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = createInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { label, moment, needsNote } = parsed.data;
  const pharmacyId = guard.session.user.pharmacyId;

  const last = await prisma.checklistItem.findFirst({
    where: { pharmacyId, moment },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const item = await prisma.checklistItem.create({
    data: {
      pharmacyId,
      label,
      moment,
      needsNote: needsNote ?? false,
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: item.id });
}

const patchInput = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  needsNote: z.boolean().optional(),
});

/** PATCH — modifie un élément (renommer, réordonner, activer/désactiver). */
async function PATCH__impl(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { id, ...rest } = parsed.data;
  // Scope officine : updateMany garantit qu'on ne touche pas une autre officine.
  const res = await prisma.checklistItem.updateMany({
    where: { id, pharmacyId: guard.session.user.pharmacyId },
    data: rest,
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= — supprime un élément (et ses coches, en cascade). */
async function DELETE__impl(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id manquant" }, { status: 400 });
  }
  const res = await prisma.checklistItem.deleteMany({
    where: { id, pharmacyId: guard.session.user.pharmacyId },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling(POST__impl);
export const PATCH = withErrorHandling(PATCH__impl);
export const DELETE = withErrorHandling(DELETE__impl);
