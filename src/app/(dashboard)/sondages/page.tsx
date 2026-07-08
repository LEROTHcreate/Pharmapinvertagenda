import { auth } from "@/auth";
import { canEditPlanning } from "@/lib/permissions";
import { SondagesView } from "@/components/sondages/SondagesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sondages · PharmaPlanning" };

/**
 * Sondages express — un responsable pose une question à l'équipe (« Qui peut
 * venir samedi ? »), chacun répond en un tap. Visible par tous ; création et
 * clôture réservées aux manageurs+ (gaté page + serveur).
 */
export default async function SondagesPage() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <SondagesView
      canManage={canEditPlanning(session.user.role)}
      canVote={!!session.user.employeeId}
    />
  );
}
