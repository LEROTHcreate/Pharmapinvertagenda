import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPayrollNoteInput } from "@/validators/payroll-note";

export const runtime = "nodejs";

/**
 * GET /api/payroll-notes
 * Toute l'équipe de la pharmacie voit toutes les notes (la liste sert de
 * journal partagé). On trie par date d'événement desc — la plus récente
 * apparaît en haut, comme dans l'Excel d'origine.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const notes = await prisma.payrollNote.findMany({
    where: { pharmacyId: session.user.pharmacyId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      date: true,
      infos: true,
      motif: true,
      accountingNote: true,
      status: true,
      accountedAt: true,
      accountedById: true,
      createdAt: true,
      authorId: true,
      author: {
        select: {
          id: true,
          name: true,
          avatarId: true,
          employee: { select: { firstName: true, displayColor: true } },
        },
      },
    },
  });

  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      date: n.date.toISOString().slice(0, 10),
      infos: n.infos,
      motif: n.motif,
      accountingNote: n.accountingNote,
      status: n.status,
      accountedAt: n.accountedAt?.toISOString() ?? null,
      accountedById: n.accountedById,
      createdAt: n.createdAt.toISOString(),
      author: {
        id: n.author.id,
        name: n.author.name,
        avatarId: n.author.avatarId,
        firstName: n.author.employee?.firstName ?? null,
        displayColor: n.author.employee?.displayColor ?? null,
      },
    })),
  });
}

/**
 * POST /api/payroll-notes
 * Création d'une note par n'importe quel collaborateur connecté.
 * Statut initial : PENDING (à comptabiliser par l'admin).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createPayrollNoteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const created = await prisma.payrollNote.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      authorId: session.user.id,
      date: new Date(`${parsed.data.date}T00:00:00Z`),
      infos: parsed.data.infos,
      motif: parsed.data.motif?.trim() || null,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
