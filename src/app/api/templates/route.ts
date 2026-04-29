import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { upsertTemplateInput } from "@/validators/template";

export const runtime = "nodejs";

/** GET /api/templates — liste des gabarits (admin) */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const templates = await prisma.weekTemplate.findMany({
    where: { pharmacyId: session.user.pharmacyId },
    orderBy: { weekType: "asc" },
    include: {
      entries: {
        select: {
          id: true,
          employeeId: true,
          dayOfWeek: true,
          timeSlot: true,
          type: true,
          taskCode: true,
          absenceCode: true,
        },
      },
    },
  });

  return NextResponse.json({ templates });
}

/**
 * POST /api/templates — création OU mise à jour d'un gabarit (admin).
 * Si `id` est présent dans le payload → update du gabarit existant.
 * Sinon → création d'un nouveau gabarit (plusieurs gabarits S1/S2 autorisés).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = upsertTemplateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Vérification rôle/poste
  const employeeIds = Array.from(new Set(parsed.data.entries.map((e) => e.employeeId)));
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, pharmacyId: session.user.pharmacyId },
    select: { id: true, status: true },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  if (empMap.size !== employeeIds.length) {
    return NextResponse.json({ error: "collaborateur inconnu" }, { status: 400 });
  }

  for (const e of parsed.data.entries) {
    if (e.type === "TASK" && e.taskCode) {
      const emp = empMap.get(e.employeeId)!;
      if (!isTaskAllowed(emp.status, e.taskCode)) {
        return NextResponse.json(
          {
            error: `Le poste ${e.taskCode} n'est pas autorisé pour ce rôle (${emp.status}).`,
          },
          { status: 400 }
        );
      }
    }
  }

  // ─── Update si id fourni, création sinon ───
  let templateId: string;
  if (parsed.data.id) {
    // Vérifie que le gabarit existe et appartient à la pharmacie de l'admin
    const existing = await prisma.weekTemplate.findFirst({
      where: { id: parsed.data.id, pharmacyId: session.user.pharmacyId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Gabarit introuvable" }, { status: 404 });
    }
    await prisma.weekTemplate.update({
      where: { id: existing.id },
      data: { name: parsed.data.name, weekType: parsed.data.weekType },
    });
    templateId = existing.id;
  } else {
    const created = await prisma.weekTemplate.create({
      data: {
        pharmacyId: session.user.pharmacyId,
        weekType: parsed.data.weekType,
        name: parsed.data.name,
      },
      select: { id: true },
    });
    templateId = created.id;
  }

  // Remplacement complet des entrées (UPSERT comportement)
  await prisma.$transaction([
    prisma.weekTemplateEntry.deleteMany({ where: { templateId } }),
    prisma.weekTemplateEntry.createMany({
      data: parsed.data.entries.map((e) => ({
        templateId,
        employeeId: e.employeeId,
        dayOfWeek: e.dayOfWeek,
        timeSlot: e.timeSlot,
        type: e.type,
        taskCode: e.type === "TASK" ? e.taskCode ?? null : null,
        absenceCode: e.type === "ABSENCE" ? e.absenceCode ?? null : null,
      })),
    }),
  ]);

  return NextResponse.json({ ok: true, templateId });
}
