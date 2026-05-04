import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { PayrollView } from "@/components/payroll/PayrollView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rémunération · PharmaPlanning" };

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Garde-fou serveur : on lit la fiche User complète pour vérifier
  // canAccessPayroll + status de l'Employee lié (titulaire ?).
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
  if (!allowed) {
    // Page accessible uniquement aux super-admins + admins titulaires autorisés.
    // Les autres sont redirigés vers le planning sans message d'erreur explicite
    // (l'item de menu n'apparaît pas pour eux de toute façon).
    redirect("/planning");
  }

  // Mois cible : ?month=YYYY-MM, défaut = mois en cours
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthParam = searchParams.month ?? defaultMonth;

  return <PayrollView initialMonth={monthParam} />;
}
