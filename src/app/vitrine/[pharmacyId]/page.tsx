import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyVitrineToken } from "@/lib/vitrine";
import { parseWeekHours } from "@/lib/opening-hours";
import { getPharmacyWeather } from "@/lib/weather";
import { toIsoDate } from "@/lib/planning-utils";
import { GARDE_TYPE_LABELS } from "@/lib/gardes";
import { VitrineScreen } from "@/components/vitrine/VitrineScreen";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Vitrine",
  robots: { index: false, follow: false },
};

/**
 * Écran vitrine PUBLIC (hors layout dashboard → pas de sidebar). Accessible sans
 * connexion via un jeton HMAC lié à l'officine (cf. `src/lib/vitrine.ts`).
 * N'expose que de l'information publique : garde, horaires, message du jour.
 */
export default async function VitrinePage({
  params,
  searchParams,
}: {
  params: { pharmacyId: string };
  searchParams: { k?: string };
}) {
  const { pharmacyId } = params;
  if (!verifyVitrineToken(pharmacyId, searchParams.k)) notFound();

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: {
      name: true,
      address: true,
      phone: true,
      logoUrl: true,
      dailyNotice: true,
      openingHours: true,
    },
  });
  if (!pharmacy) notFound();

  // Prochaine garde de l'officine (à partir d'aujourd'hui).
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const nextGarde = await prisma.garde.findFirst({
    where: { pharmacyId, date: { gte: dayStart } },
    orderBy: { date: "asc" },
    select: {
      date: true,
      type: true,
      pharmacist: { select: { firstName: true, lastName: true } },
    },
  });

  // Météo (best-effort : ne bloque jamais l'écran si l'API est indisponible).
  const weather = await getPharmacyWeather(pharmacy.address).catch(() => null);

  const garde = nextGarde
    ? {
        name: `${nextGarde.pharmacist.firstName}${
          nextGarde.pharmacist.lastName && nextGarde.pharmacist.lastName !== "—"
            ? " " + nextGarde.pharmacist.lastName
            : ""
        }`.trim(),
        typeLabel: GARDE_TYPE_LABELS[nextGarde.type],
        dateIso: toIsoDate(nextGarde.date),
      }
    : null;

  return (
    <VitrineScreen
      pharmacyName={pharmacy.name}
      logoUrl={pharmacy.logoUrl}
      address={pharmacy.address}
      phone={pharmacy.phone}
      notice={pharmacy.dailyNotice}
      weekHours={parseWeekHours(pharmacy.openingHours)}
      garde={garde}
      weather={weather}
    />
  );
}
