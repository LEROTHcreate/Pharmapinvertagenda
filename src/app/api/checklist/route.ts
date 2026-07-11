import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toggleInput = z.object({
  itemId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  done: z.boolean(),
  note: z.string().max(200).nullish(),
});

/**
 * POST /api/checklist — coche / décoche un élément de la checklist pour une date.
 * Accessible à tout collaborateur connecté (l'équipe fait la checklist). Trace
 * qui a validé et quand.
 */
async function POST__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = toggleInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { itemId, date, done, note } = parsed.data;

  // L'élément doit appartenir à l'officine de l'utilisateur.
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, pharmacyId: session.user.pharmacyId },
    select: { id: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
  }

  const day = new Date(`${date}T00:00:00.000Z`);
  const who = done
    ? { checkedById: session.user.id, checkedByName: session.user.name, checkedAt: new Date() }
    : { checkedById: session.user.id, checkedByName: session.user.name, checkedAt: null };

  await prisma.checklistCheck.upsert({
    where: { itemId_date: { itemId, date: day } },
    create: {
      itemId,
      pharmacyId: session.user.pharmacyId,
      date: day,
      done,
      note: note ?? null,
      ...who,
    },
    update: { done, note: note ?? null, ...who },
  });

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling(POST__impl);
