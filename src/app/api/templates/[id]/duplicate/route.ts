import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma, prismaDirect } from "@/lib/prisma";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

export const runtime = "nodejs";
export const maxDuration = 30;

const inputSchema = z.object({
  /** Nom du nouveau gabarit. Si absent, on génère "Copie de <nom source>". */
  newName: z.string().trim().min(1).max(80).optional(),
  /** Type cible (S1/S2). Si absent, on garde le type du gabarit source. */
  targetWeekType: z.enum(["S1", "S2"]).optional(),
});

/**
 * POST /api/templates/[id]/duplicate
 *
 * Duplique un gabarit existant en :
 *  - Copiant son nom (préfixé "Copie de" si pas fourni) et son type (ou
 *    en basculant S1↔S2 si `targetWeekType` est précisé).
 *  - Copiant TOUTES ses entrées (employee × day × slot × type × code).
 *
 * Cas d'usage : tester une variante d'un gabarit existant sans toucher à
 * l'original — l'admin clique "Dupliquer", obtient une copie modifiable,
 * et conserve l'original intact pour rollback.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "payload invalide" }, { status: 400 });
  }

  // Récupère le gabarit source + ses entrées (vérification d'ownership)
  const source = await prisma.weekTemplate.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    include: { entries: true },
  });
  if (!source) {
    return NextResponse.json({ error: "Gabarit introuvable" }, { status: 404 });
  }

  const targetType = parsed.data.targetWeekType ?? source.weekType;
  const newName =
    parsed.data.newName?.trim() || `Copie de ${source.name}`;

  // Crée le nouveau gabarit
  const created = await prisma.weekTemplate.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      weekType: targetType,
      name: newName,
    },
    select: { id: true, name: true, weekType: true },
  });

  // Copie les entrées en bulk via prismaDirect (bypass pgbouncer pour la
  // perf, comme dans apply-batch). Pour ~1000 entrées : ~200ms en local.
  if (source.entries.length > 0) {
    const rows = source.entries.map((e) => ({
      templateId: created.id,
      employeeId: e.employeeId,
      dayOfWeek: e.dayOfWeek,
      timeSlot: e.timeSlot,
      type: e.type,
      taskCode: e.taskCode,
      absenceCode: e.absenceCode,
    }));
    // 1 seul createMany (limite Postgres ~9000 rows pour 7 cols)
    const CHUNK = 8000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prismaDirect.weekTemplateEntry.createMany({
        data: rows.slice(i, i + CHUNK),
        skipDuplicates: false,
      });
    }
  }

  // Invalide le cache de la liste des gabarits pour qu'il apparaisse
  // immédiatement dans /gabarits sans attendre 5 min de revalidation.
  revalidateTag(DASHBOARD_CACHE_TAGS.templatesList(session.user.pharmacyId));

  return NextResponse.json({
    ok: true,
    id: created.id,
    name: created.name,
    weekType: created.weekType,
    entryCount: source.entries.length,
  });
}
