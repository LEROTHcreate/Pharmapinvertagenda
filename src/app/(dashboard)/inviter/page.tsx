import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { InviteView } from "@/components/invite/InviteView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inviter l'équipe · PharmaPlanning" };

/**
 * Page « Inviter l'équipe » (admin) — génère un lien d'inscription avec le SIRET
 * de l'officine pré-rempli (mode « rejoindre ») + un QR code. L'origine est
 * lue sur la requête pour que le lien pointe vers le bon domaine (prod/preview).
 */
export default async function InviterPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdminLevel(session.user.role)) redirect("/accueil");

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: session.user.pharmacyId },
    select: { name: true, siret: true },
  });

  const h = headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const siret = pharmacy?.siret ?? null;
  const link = siret
    ? `${origin}/signup?siret=${encodeURIComponent(siret)}`
    : `${origin}/signup`;

  return (
    <InviteView
      link={link}
      pharmacyName={pharmacy?.name ?? "votre officine"}
      hasSiret={!!siret}
    />
  );
}
