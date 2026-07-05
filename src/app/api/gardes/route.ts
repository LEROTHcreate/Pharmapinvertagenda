import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Pharmacie de garde (admin).
 *
 *  POST   { pharmacistId, date, type, extraMajorations?, note? } → ajoute une garde
 *  DELETE ?id=…                                                   → supprime une garde
 *  PATCH  { rateNuit?, rateDimanche?, rateJourFerie? }            → règle les indemnités
 *
 * Seuls les employés de statut PHARMACIEN ou TITULAIRE peuvent être affectés à
 * une garde (dans beaucoup d'officines, les titulaires assurent les gardes).
 * La logique d'équité / rotation / indemnités vit dans src/lib/gardes.ts et est
 * calculée côté page (server component).
 */

const GARDE_TYPE = z.enum(["NUIT", "DIMANCHE", "JOUR_FERIE"]);

const postSchema = z.object({
  pharmacistId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue YYYY-MM-DD"),
  type: GARDE_TYPE,
  extraMajorations: z.array(GARDE_TYPE).max(2).optional(),
  note: z.string().max(200).nullish(),
});

async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminLevel(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload invalide" },
      { status: 400 }
    );
  }

  // Le collaborateur doit appartenir à l'officine ET pouvoir assurer une garde
  // (pharmacien ou titulaire).
  const pharmacist = await prisma.employee.findFirst({
    where: {
      id: parsed.data.pharmacistId,
      pharmacyId: session.user.pharmacyId,
    },
    select: { id: true, status: true },
  });
  if (!pharmacist) {
    return NextResponse.json({ error: "collaborateur inconnu" }, { status: 400 });
  }
  if (pharmacist.status !== "PHARMACIEN" && pharmacist.status !== "TITULAIRE") {
    return NextResponse.json(
      { error: "Seuls les pharmaciens et titulaires peuvent assurer une garde." },
      { status: 400 }
    );
  }

  await prisma.garde.create({
    data: {
      pharmacyId: session.user.pharmacyId,
      pharmacistId: parsed.data.pharmacistId,
      date: new Date(`${parsed.data.date}T00:00:00Z`),
      type: parsed.data.type,
      extraMajorations: parsed.data.extraMajorations ?? [],
      note: parsed.data.note ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}

async function DELETE__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminLevel(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Paramètre 'id' manquant" }, { status: 400 });
  }
  // deleteMany scopé à la pharmacie → pas de suppression cross-officine.
  await prisma.garde.deleteMany({
    where: { id, pharmacyId: session.user.pharmacyId },
  });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  rateNuit: z.number().min(0).max(100000).nullish(),
  rateDimanche: z.number().min(0).max(100000).nullish(),
  rateJourFerie: z.number().min(0).max(100000).nullish(),
});

async function PATCH__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminLevel(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload invalide" },
      { status: 400 }
    );
  }
  await prisma.pharmacy.update({
    where: { id: session.user.pharmacyId },
    data: {
      gardeRateNuit: parsed.data.rateNuit ?? null,
      gardeRateDimanche: parsed.data.rateDimanche ?? null,
      gardeRateJourFerie: parsed.data.rateJourFerie ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling(POST__impl);
export const DELETE = withErrorHandling(DELETE__impl);
export const PATCH = withErrorHandling(PATCH__impl);
