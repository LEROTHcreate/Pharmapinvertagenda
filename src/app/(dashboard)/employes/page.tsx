import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canManageTeam } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { EmployeesTable } from "@/components/employees/EmployeesTable";
import type { EmployeeRowData } from "@/components/employees/EmployeesTable";
import { HrDeadlinesCard } from "@/components/employees/HrDeadlinesCard";
import {
  TeamEventsPanel,
  type TeamEventRow,
} from "@/components/employees/TeamEventsPanel";
import { upcomingDeadlines } from "@/lib/hr-deadlines";
import { sweepInactiveEmployees } from "@/lib/employee-lifecycle";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Équipe — PharmaPlanning",
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function EmployesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canManageTeam(session.user.role)) redirect("/planning");

  // Désactivation automatique des collaborateurs dont la date de départ ou la
  // fin de contrat (non-CDI) est passée, AVANT de charger la liste.
  const todayIso = new Date().toISOString().slice(0, 10);
  await sweepInactiveEmployees(session.user.pharmacyId, todayIso);

  const employees = await prisma.employee.findMany({
    where: { pharmacyId: session.user.pharmacyId },
    orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      weeklyHours: true,
      overtimeReference: true,
      displayColor: true,
      displayOrder: true,
      isActive: true,
      hireDate: true,
      contractType: true,
      contractEndDate: true,
      trialEndDate: true,
      departureDate: true,
      lastMedicalVisitDate: true,
      lastProfessionalInterviewDate: true,
      dpcLastDate: true,
    },
  });

  const rows: EmployeeRowData[] = employees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    status: e.status,
    weeklyHours: e.weeklyHours,
    overtimeReference: e.overtimeReference,
    displayColor: e.displayColor,
    displayOrder: e.displayOrder,
    isActive: e.isActive,
    hireDate: iso(e.hireDate),
    contractType: e.contractType,
    contractEndDate: iso(e.contractEndDate),
    trialEndDate: iso(e.trialEndDate),
    departureDate: iso(e.departureDate),
    lastMedicalVisitDate: iso(e.lastMedicalVisitDate),
    lastProfessionalInterviewDate: iso(e.lastProfessionalInterviewDate),
    dpcLastDate: iso(e.dpcLastDate),
  }));

  // Comptes utilisateurs reliés aux fiches → permet de choisir le RÔLE
  // (Collaborateur / Manageur / Titulaire) directement depuis la page Équipe.
  const linkedUsers = await prisma.user.findMany({
    where: { pharmacyId: session.user.pharmacyId, employeeId: { not: null } },
    select: { id: true, role: true, employeeId: true },
  });
  const roleByEmployeeId: Record<
    string,
    { userId: string; role: (typeof linkedUsers)[number]["role"]; isCurrentUser: boolean }
  > = {};
  for (const u of linkedUsers) {
    if (u.employeeId) {
      roleByEmployeeId[u.employeeId] = {
        userId: u.id,
        role: u.role,
        isCurrentUser: u.id === session.user.id,
      };
    }
  }

  // Échéances RH à venir (sur les collaborateurs actifs uniquement).
  const deadlines = upcomingDeadlines(
    employees.filter((e) => e.isActive),
    todayIso
  );

  // Événements d'équipe à venir (repas, animations labo, entretiens…).
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const events = await prisma.teamEvent.findMany({
    where: { pharmacyId: session.user.pharmacyId, date: { gte: startOfToday } },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 40,
    select: {
      id: true,
      title: true,
      description: true,
      date: true,
      time: true,
      type: true,
      location: true,
    },
  });
  const eventRows: TeamEventRow[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date.toISOString().slice(0, 10),
    time: e.time,
    type: e.type,
    location: e.location,
  }));

  const canManageEvents = canManageTeam(session.user.role);

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
          <p className="text-sm text-muted-foreground">
            Gérer l&apos;équipe de la pharmacie · {rows.length} collaborateur
            {rows.length > 1 ? "s" : ""}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* Colonne gauche : échéances RH + tableau de l'équipe */}
        <div className="min-w-0 flex-1 space-y-4">
          <HrDeadlinesCard deadlines={deadlines} />
          <EmployeesTable
            employees={rows}
            roleByEmployeeId={roleByEmployeeId}
            currentUserRole={session.user.role}
          />
        </div>

        {/* Colonne droite : la vie de l'équipe (événements animés) */}
        <div className="xl:w-[420px] xl:shrink-0">
          <TeamEventsPanel events={eventRows} canManage={canManageEvents} />
        </div>
      </div>
    </div>
  );
}
