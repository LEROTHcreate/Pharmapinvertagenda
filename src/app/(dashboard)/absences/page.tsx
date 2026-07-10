import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canEditPlanning } from "@/lib/permissions";
import {
  AbsencesHub,
  type AbsencesHubTab,
} from "@/components/absences/AbsencesHub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absences & remplacements — PharmaPlanning" };

export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const initialTab: AbsencesHubTab =
    searchParams.tab === "disponibilites"
      ? "disponibilites"
      : searchParams.tab === "creneaux"
        ? "creneaux"
        : "absences";

  // Créneaux à couvrir : la création/assignation est réservée aux manageurs+.
  const canManage = canEditPlanning(session.user.role);
  const employees = await prisma.employee.findMany({
    where: { pharmacyId: session.user.pharmacyId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      displayColor: true,
    },
  });

  return (
    <AbsencesHub
      currentUser={{
        role: session.user.role,
        employeeId: session.user.employeeId ?? null,
      }}
      initialTab={initialTab}
      canManage={canManage}
      employees={employees}
    />
  );
}
