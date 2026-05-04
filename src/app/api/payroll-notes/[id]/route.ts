import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reviewPayrollNoteInput } from "@/validators/payroll-note";

export const runtime = "nodejs";

/**
 * PATCH /api/payroll-notes/[id]
 * Édition admin : marque comptabilisée (ou annule), met à jour la note de
 * comptabilisation. Réservé aux admins.
 */
export async function PATCH(
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

  const note = await prisma.payrollNote.findUnique({
    where: { id: params.id },
    select: { id: true, pharmacyId: true, status: true },
  });
  if (!note || note.pharmacyId !== session.user.pharmacyId) {
    return NextResponse.json({ error: "Note introuvable" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = reviewPayrollNoteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data: {
    status?: "PENDING" | "ACCOUNTED";
    accountedAt?: Date | null;
    accountedById?: string | null;
    accountingNote?: string | null;
  } = {};

  if (parsed.data.markAccounted !== undefined) {
    if (parsed.data.markAccounted) {
      data.status = "ACCOUNTED";
      data.accountedAt = new Date();
      data.accountedById = session.user.id;
    } else {
      data.status = "PENDING";
      data.accountedAt = null;
      data.accountedById = null;
    }
  }
  if (parsed.data.accountingNote !== undefined) {
    data.accountingNote = parsed.data.accountingNote?.trim() || null;
  }

  await prisma.payrollNote.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/payroll-notes/[id]
 * Suppression :
 *  - Admin → peut supprimer n'importe quelle note.
 *  - Auteur → peut supprimer SA propre note tant qu'elle est PENDING.
 *    Une fois comptabilisée, seul un admin peut la retirer.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const note = await prisma.payrollNote.findUnique({
    where: { id: params.id },
    select: { id: true, pharmacyId: true, authorId: true, status: true },
  });
  if (!note || note.pharmacyId !== session.user.pharmacyId) {
    return NextResponse.json({ error: "Note introuvable" }, { status: 404 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const isOwner = note.authorId === session.user.id;
  const ownerCanDelete = isOwner && note.status === "PENDING";
  if (!isAdmin && !ownerCanDelete) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.payrollNote.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
