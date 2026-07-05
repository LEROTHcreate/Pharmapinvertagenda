import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Souhaits de disponibilité posés par les salariés (indispo / préférence),
 * dont l'admin tient compte au moment de bâtir le planning.
 *
 *  GET  ?scope=mine|all   → mes souhaits (défaut) ou ceux de l'équipe (admin)
 *  POST { date, kind, note? } → enregistre (upsert) MON souhait pour ce jour
 *  DELETE ?date=YYYY-MM-DD → supprime MON souhait de ce jour
 *
 * Un souhait appartient à l'Employee lié au compte. Les comptes sans fiche
 * Employee (ex. super-admin) ne peuvent pas en poser, mais un admin peut
 * consulter ceux de l'équipe (scope=all).
 */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function GET__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const scope = sp.get("scope") ?? "mine";
  const from = new Date(`${todayIso()}T00:00:00Z`);

  // Lookup ciblé : le souhait d'UN employé pour UNE date (admin). Utilisé par
  // l'éditeur de cellule du planning pour avertir l'admin s'il planifie
  // quelqu'un ayant déclaré une indisponibilité ce jour-là.
  if (scope === "cell") {
    if (!isAdminLevel(session.user.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const employeeId = sp.get("employeeId");
    const date = sp.get("date");
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
      return NextResponse.json({ wish: null });
    }
    const wish = await prisma.availabilityWish.findFirst({
      where: {
        employeeId,
        pharmacyId: session.user.pharmacyId,
        date: new Date(`${date}T00:00:00Z`),
      },
      select: { kind: true, note: true },
    });
    return NextResponse.json({ wish });
  }

  if (scope === "all") {
    if (!isAdminLevel(session.user.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const wishes = await prisma.availabilityWish.findMany({
      where: { pharmacyId: session.user.pharmacyId, date: { gte: from } },
      orderBy: [{ date: "asc" }],
      select: {
        id: true,
        date: true,
        kind: true,
        note: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return NextResponse.json({
      wishes: wishes.map((w) => ({
        id: w.id,
        date: w.date.toISOString().slice(0, 10),
        kind: w.kind,
        note: w.note,
        employeeId: w.employee.id,
        employeeName: `${w.employee.firstName} ${w.employee.lastName}`.trim(),
      })),
    });
  }

  // scope = mine
  if (!session.user.employeeId) {
    return NextResponse.json({ wishes: [] });
  }
  const wishes = await prisma.availabilityWish.findMany({
    where: { employeeId: session.user.employeeId, date: { gte: from } },
    orderBy: [{ date: "asc" }],
    select: { id: true, date: true, kind: true, note: true },
  });
  return NextResponse.json({
    wishes: wishes.map((w) => ({
      id: w.id,
      date: w.date.toISOString().slice(0, 10),
      kind: w.kind,
      note: w.note,
    })),
  });
}

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue YYYY-MM-DD"),
  kind: z.enum(["UNAVAILABLE", "PREFER_OFF", "PREFER_WORK"]),
  note: z.string().max(200).nullish(),
});

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.employeeId) {
    return NextResponse.json(
      { error: "Votre compte n'est pas lié à une fiche collaborateur." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload invalide" },
      { status: 400 }
    );
  }
  // Pas de souhait dans le passé.
  if (parsed.data.date < todayIso()) {
    return NextResponse.json(
      { error: "Impossible de poser un souhait dans le passé." },
      { status: 400 }
    );
  }

  const date = new Date(`${parsed.data.date}T00:00:00Z`);
  await prisma.availabilityWish.upsert({
    where: {
      employeeId_date: { employeeId: session.user.employeeId, date },
    },
    create: {
      pharmacyId: session.user.pharmacyId,
      employeeId: session.user.employeeId,
      date,
      kind: parsed.data.kind,
      note: parsed.data.note ?? null,
    },
    update: { kind: parsed.data.kind, note: parsed.data.note ?? null },
  });
  return NextResponse.json({ ok: true });
}

async function DELETE__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.employeeId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const dateParam = new URL(req.url).searchParams.get("date");
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "Paramètre 'date' invalide" }, { status: 400 });
  }
  const date = new Date(`${dateParam}T00:00:00Z`);
  await prisma.availabilityWish.deleteMany({
    where: { employeeId: session.user.employeeId, date },
  });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorHandling(GET__impl);
export const POST = withErrorHandling(POST__impl);
export const DELETE = withErrorHandling(DELETE__impl);
