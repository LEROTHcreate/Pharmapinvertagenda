import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * PATCH /api/profil/titulaire-pay-mode
 * Le titulaire choisit si ses heures supplémentaires sont comptabilisées dans
 * les stats. Réglage personnel, réservé aux employés de statut TITULAIRE.
 *  - countsOvertime = false (défaut) → dividendes / salaire fixe, HS non comptées
 *  - countsOvertime = true           → mode classique (comme les collaborateurs)
 */
const input = z.object({ countsOvertime: z.boolean() });

async function PATCH__impl(req: Request) {
  const session = await auth();
  if (!session?.user?.employeeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Le réglage n'a de sens que pour un titulaire, et on reste dans le périmètre
  // de la pharmacie de l'utilisateur.
  const emp = await prisma.employee.findFirst({
    where: { id: session.user.employeeId, pharmacyId: session.user.pharmacyId },
    select: { status: true },
  });
  if (!emp || emp.status !== "TITULAIRE") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.employee.update({
    where: { id: session.user.employeeId },
    data: { titulaireCountsOvertime: parsed.data.countsOvertime },
  });

  return NextResponse.json({ ok: true, countsOvertime: parsed.data.countsOvertime });
}

export const PATCH = withErrorHandling(PATCH__impl);
