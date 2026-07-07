import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { canApplyTemplates } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { patchTemplateMetaInput } from "@/validators/template";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

export const runtime = "nodejs";

/**
 * PATCH /api/templates/[id] — édition rapide des métadonnées (nom / catégorie /
 * note / type), SANS toucher aux créneaux. Sert à l'édition inline depuis la
 * liste des gabarits. Ne renvoie que les champs mis à jour.
 */
async function PATCH__impl(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canApplyTemplates(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchTemplateMetaInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const target = await prisma.weekTemplate.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true, weekType: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Gabarit introuvable" }, { status: 404 });
  }

  // On n'écrit que les champs fournis. Chaîne vide (catégorie/note) → null.
  const data: {
    name?: string;
    category?: string | null;
    description?: string | null;
    weekType?: "S1" | "S2";
    isDefault?: boolean;
  } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.weekType !== undefined) data.weekType = parsed.data.weekType;
  if (parsed.data.category !== undefined) {
    data.category = parsed.data.category ? parsed.data.category : null;
  }
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description ? parsed.data.description : null;
  }
  if (parsed.data.isDefault !== undefined) data.isDefault = parsed.data.isDefault;

  // Un seul gabarit "par défaut" par type/pharmacie : si on épingle celui-ci,
  // on désépingle d'abord les autres du même type (type effectif = nouveau si
  // fourni dans le même patch, sinon l'actuel).
  if (parsed.data.isDefault === true) {
    const effectiveType = parsed.data.weekType ?? target.weekType;
    await prisma.weekTemplate.updateMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        weekType: effectiveType,
        isDefault: true,
        id: { not: target.id },
      },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.weekTemplate.update({
    where: { id: target.id },
    data,
    select: {
      id: true,
      name: true,
      weekType: true,
      category: true,
      description: true,
      isDefault: true,
    },
  });

  revalidateTag(DASHBOARD_CACHE_TAGS.templatesList(session.user.pharmacyId));
  return NextResponse.json({ ok: true, template: updated });
}

/** DELETE /api/templates/[id] — supprime un gabarit (admin) */
async function DELETE__impl(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canApplyTemplates(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const target = await prisma.weekTemplate.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Gabarit introuvable" }, { status: 404 });
  }

  await prisma.weekTemplate.delete({ where: { id: target.id } });
  revalidateTag(DASHBOARD_CACHE_TAGS.templatesList(session.user.pharmacyId));
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorHandling(PATCH__impl);
export const DELETE = withErrorHandling(DELETE__impl);
