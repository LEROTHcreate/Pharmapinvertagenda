import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { BilanView } from "@/components/bilan/BilanView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bilan · PharmaPlanning" };

/**
 * Module « Bilan » — centralise les données financières de l'officine (compte
 * de résultat + bilan), par import de PDF ou saisie manuelle, calcule les
 * ratios clés et propose une analyse experte (Hygie). Données très sensibles →
 * réservé aux titulaires autorisés au module financier.
 */
export default async function BilanPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      employeeId: true,
      canAccessPayroll: true,
      employee: { select: { status: true } },
    },
  });
  if (!me) redirect("/login");
  const allowed = canViewPayroll({
    role: me.role,
    employeeId: me.employeeId,
    canAccessPayroll: me.canAccessPayroll,
    employeeStatus: me.employee?.status ?? null,
  });
  if (!allowed) redirect("/planning");

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: session.user.pharmacyId },
    select: { name: true },
  });

  return <BilanView pharmacyName={pharmacy?.name ?? "l'officine"} />;
}
