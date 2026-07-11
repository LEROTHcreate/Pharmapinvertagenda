import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canEditPlanning, isAdminLevel } from "@/lib/permissions";
import { toIsoDate } from "@/lib/planning-utils";
import { computeCpBalances, type CpBalance } from "@/lib/conges-paies";
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

  const requestedTab = searchParams.tab;
  // Créneaux à couvrir : la création/assignation est réservée aux manageurs+.
  const canManage = canEditPlanning(session.user.role);
  // Soldes CP : donnée sensible → calculée et affichée UNIQUEMENT au titulaire.
  const isTitulaire = isAdminLevel(session.user.role);

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

  // ─── Soldes CP (titulaire uniquement) ───────────────────────────────
  let cpData: CpBalance[] | null = null;
  if (isTitulaire) {
    // Congés pris = dates DISTINCTES de type CONGE (bornées à ~2 ans pour la
    // perf ; la date de base est en pratique récente).
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    const [cpEmployees, congeEntries] = await Promise.all([
      prisma.employee.findMany({
        where: { pharmacyId: session.user.pharmacyId, isActive: true },
        orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          displayColor: true,
          hireDate: true,
          cpBalanceBase: true,
          cpBalanceBaseDate: true,
        },
      }),
      prisma.scheduleEntry.findMany({
        where: {
          pharmacyId: session.user.pharmacyId,
          type: "ABSENCE",
          absenceCode: "CONGE",
          date: { gte: cutoff },
        },
        select: { employeeId: true, date: true },
        distinct: ["employeeId", "date"],
      }),
    ]);

    const congeDatesByEmp = new Map<string, string[]>();
    for (const c of congeEntries) {
      const arr = congeDatesByEmp.get(c.employeeId) ?? [];
      arr.push(toIsoDate(c.date));
      congeDatesByEmp.set(c.employeeId, arr);
    }
    cpData = computeCpBalances(cpEmployees, congeDatesByEmp, new Date());
  }

  const initialTab: AbsencesHubTab =
    requestedTab === "disponibilites"
      ? "disponibilites"
      : requestedTab === "creneaux"
        ? "creneaux"
        : requestedTab === "conges" && isTitulaire
          ? "conges"
          : "absences";

  return (
    <AbsencesHub
      currentUser={{
        role: session.user.role,
        employeeId: session.user.employeeId ?? null,
      }}
      initialTab={initialTab}
      canManage={canManage}
      employees={employees}
      cpData={cpData}
    />
  );
}
