import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toIsoDate } from "@/lib/planning-utils";
import {
  gardeEquity,
  suggestNextGarde,
  totalIndemnites,
  GARDE_RATES_PLACEHOLDER,
  type Garde,
  type GardeRates,
} from "@/lib/gardes";
import { GardesView } from "@/components/gardes/GardesView";

export const dynamic = "force-dynamic";

/**
 * Page « Pharmacie de garde » — planning des gardes des pharmaciens, avec
 * compteur d'équité, suggestion de rotation et calcul des indemnités.
 * Les calculs purs vivent dans src/lib/gardes.ts.
 */
export default async function GardesPage() {
  const session = await auth();
  if (!session?.user) return null;

  const isAdmin = session.user.role === "ADMIN";
  const pharmacyId = session.user.pharmacyId;

  // Fenêtre glissante : 6 mois en arrière → 12 mois en avant (bornée).
  const now = new Date();
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)
  );
  const to = new Date(
    Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 1)
  );

  const [pharmacists, rawGardes, pharmacy] = await Promise.all([
    prisma.employee.findMany({
      where: { pharmacyId, isActive: true, status: "PHARMACIEN" },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, displayColor: true },
    }),
    prisma.garde.findMany({
      where: { pharmacyId, date: { gte: from, lt: to } },
      orderBy: [{ date: "asc" }],
      select: {
        id: true,
        date: true,
        type: true,
        extraMajorations: true,
        note: true,
        pharmacistId: true,
      },
    }),
    prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: {
        gardeRateNuit: true,
        gardeRateDimanche: true,
        gardeRateJourFerie: true,
      },
    }),
  ]);

  const pharmacistIds = pharmacists.map((p) => p.id);
  const nameById = new Map(
    pharmacists.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()])
  );

  // Gardes au format lib (date ISO).
  const gardes: Garde[] = rawGardes.map((g) => ({
    id: g.id,
    pharmacistId: g.pharmacistId,
    date: toIsoDate(g.date),
    type: g.type,
    extraMajorations: g.extraMajorations,
  }));

  // Taux d'indemnité : réglages officine, sinon valeurs indicatives par défaut.
  const rates: GardeRates = {
    NUIT: pharmacy?.gardeRateNuit ?? GARDE_RATES_PLACEHOLDER.NUIT,
    DIMANCHE: pharmacy?.gardeRateDimanche ?? GARDE_RATES_PLACEHOLDER.DIMANCHE,
    JOUR_FERIE:
      pharmacy?.gardeRateJourFerie ?? GARDE_RATES_PLACEHOLDER.JOUR_FERIE,
  };
  const ratesAreCustom =
    pharmacy?.gardeRateNuit != null ||
    pharmacy?.gardeRateDimanche != null ||
    pharmacy?.gardeRateJourFerie != null;

  const equity = gardeEquity(gardes, pharmacistIds);
  const suggestion = suggestNextGarde(gardes, pharmacistIds);
  const indemnites = totalIndemnites(gardes, rates);

  const todayIso = toIsoDate(now);
  const upcoming = gardes
    .filter((g) => g.date >= todayIso)
    .map((g) => ({
      id: g.id,
      date: g.date,
      type: g.type,
      extraMajorations: g.extraMajorations ?? [],
      pharmacistId: g.pharmacistId,
      pharmacistName: nameById.get(g.pharmacistId) ?? "—",
    }));

  return (
    <GardesView
      isAdmin={isAdmin}
      pharmacists={pharmacists.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        color: p.displayColor,
      }))}
      upcoming={upcoming}
      equity={{
        average: equity.average,
        spread: equity.spread,
        leastLoaded: equity.leastLoaded.map((id) => nameById.get(id) ?? "—"),
        counts: equity.counts.map((c) => ({
          name: nameById.get(c.pharmacistId) ?? "—",
          total: c.total,
          byType: c.byType,
        })),
      }}
      suggestion={suggestion.map((id) => nameById.get(id) ?? "—")}
      rates={rates}
      ratesAreCustom={ratesAreCustom}
      indemnites={{
        total: indemnites.total,
        byPharmacist: Object.entries(indemnites.byPharmacist).map(
          ([id, amount]) => ({ name: nameById.get(id) ?? "—", amount })
        ),
      }}
    />
  );
}
