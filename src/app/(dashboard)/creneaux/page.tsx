import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPlanning } from "@/lib/permissions";
import { CreneauxView } from "@/components/creneaux/CreneauxView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Créneaux à couvrir · PharmaPlanning" };

/**
 * Page « Créneaux à couvrir » — un manageur+ signale un trou de planning à
 * pourvoir, les collaborateurs se positionnent, le manageur assigne. Visible
 * par tous ; les actions de gestion sont gatées (page + serveur).
 */
export default async function CreneauxPage() {
  const session = await auth();
  if (!session?.user) return null;

  const canManage = canEditPlanning(session.user.role);

  const employees = await prisma.employee.findMany({
    where: { pharmacyId: session.user.pharmacyId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, status: true, displayColor: true },
  });

  return (
    <CreneauxView
      canManage={canManage}
      myEmployeeId={session.user.employeeId ?? null}
      employees={employees}
    />
  );
}
