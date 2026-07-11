import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { computePayrollForMonth } from "@/lib/payroll-month";
import { PayrollReportSheet } from "@/components/payroll/PayrollReportSheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Récapitulatif de rémunération · PharmaPlanning" };

/**
 * Version imprimable / PDF du récapitulatif de rémunération d'un mois.
 * URL : /remuneration/imprimer?month=YYYY-MM. Réservé au module paie
 * (titulaire autorisé / créateur), mêmes droits que la page Rémunération.
 */
export default async function PayrollPrintPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
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
  const allowed =
    !!me &&
    canViewPayroll({
      role: me.role,
      employeeId: me.employeeId,
      canAccessPayroll: me.canAccessPayroll,
      employeeStatus: me.employee?.status ?? null,
    });
  if (!allowed) redirect("/planning");

  // Mois demandé (YYYY-MM), défaut = mois courant.
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : new Date().toISOString().slice(0, 7);

  const [pharmacy, data] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { name: true },
    }),
    computePayrollForMonth(session.user.pharmacyId, month),
  ]);

  return (
    <PayrollReportSheet
      pharmacyName={pharmacy?.name ?? "l'officine"}
      data={data}
    />
  );
}
