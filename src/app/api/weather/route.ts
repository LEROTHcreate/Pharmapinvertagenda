import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPharmacyWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Météo locale de l'officine (accueil). Géocode l'adresse de la pharmacie
 * puis renvoie la météo courante. `null` si adresse absente / APIs KO —
 * le widget se cache alors silencieusement.
 */
async function GET__impl() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: session.user.pharmacyId },
    select: { address: true },
  });
  const weather = await getPharmacyWeather(pharmacy?.address);
  return NextResponse.json({ weather });
}

export const GET = withErrorHandling(GET__impl);
