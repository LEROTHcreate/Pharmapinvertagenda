import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminLevel } from "@/lib/permissions";
import { BilanReportSheet } from "@/components/bilan/BilanReportSheet";
import type { BilanData } from "@/lib/bilan-fields";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rapport de bilan · PharmaPlanning" };

/**
 * Version imprimable / PDF d'un bilan : postes N/N-1, ratios et analyse Hygie.
 * URL : /bilan/imprimer?id=<bilanId>. Réservé au module financier.
 */
export default async function BilanReportPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!me || !isAdminLevel(me.role)) redirect("/planning");

  const id = searchParams.id;
  if (!id) redirect("/bilan");

  const [pharmacy, bilan] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { name: true },
    }),
    prisma.bilan.findFirst({
      where: { id, pharmacyId: session.user.pharmacyId },
      select: {
        label: true,
        year: true,
        kind: true,
        data: true,
        dataPrev: true,
        analysis: true,
        updatedAt: true,
      },
    }),
  ]);
  if (!bilan) redirect("/bilan");

  return (
    <BilanReportSheet
      pharmacyName={pharmacy?.name ?? "l'officine"}
      bilan={{
        label: bilan.label,
        year: bilan.year,
        kind: bilan.kind,
        data: (bilan.data as BilanData) ?? {},
        dataPrev: (bilan.dataPrev as BilanData) ?? {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analysis: (bilan.analysis as any) ?? null,
        updatedAt: bilan.updatedAt.toISOString(),
      }}
    />
  );
}
