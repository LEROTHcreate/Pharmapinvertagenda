import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditSettings } from "@/lib/permissions";
import { parseWeekHours, serializeWeekHours } from "@/lib/opening-hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/pharmacy/vitrine
 * Enregistre les horaires d'ouverture de l'officine (affichés sur l'écran
 * vitrine). Réservé aux titulaires (canEditSettings). Le corps `{ openingHours }`
 * est re-parsé/nettoyé côté serveur avant écriture.
 */
async function PATCH__impl(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canEditSettings(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  // Re-parse (valide + nettoie les créneaux invalides) puis re-sérialise.
  const clean = parseWeekHours(JSON.stringify(body?.openingHours ?? null));

  await prisma.pharmacy.update({
    where: { id: session.user.pharmacyId },
    data: { openingHours: serializeWeekHours(clean) },
  });

  return NextResponse.json({ ok: true, openingHours: clean });
}

export const PATCH = withErrorHandling(PATCH__impl);
