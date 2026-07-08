import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
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
  // Page visible par TOUS en lecture. Seuls les TITULAIRES (isAdminLevel) peuvent
  // éditer : rôles, fiches collaborateurs, événements. Les manageurs et
  // collaborateurs sont en lecture seule ET ne voient pas le RH sensible
  // (échéances, contrats) — ni à l'écran ni dans les données envoyées.
  const canEdit = isAdminLevel(session.user.role);

  // Désactivation automatique des collaborateurs dont la date de départ ou la
  // fin de contrat est passée — réservé aux titulaires (écriture BDD).
  const todayIso = new Date().toISOString().slice(0, 10);
  if (canEdit) {
    await sweepInactiveEmployees(session.user.pharmacyId, todayIso);
  }

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
    // ─── RH sensible : uniquement pour les titulaires (sinon neutralisé, pas
    // même envoyé au navigateur des non-titulaires) ───
    hireDate: canEdit ? iso(e.hireDate) : null,
    contractType: canEdit ? e.contractType : "CDI",
    contractEndDate: canEdit ? iso(e.contractEndDate) : null,
    trialEndDate: canEdit ? iso(e.trialEndDate) : null,
    departureDate: canEdit ? iso(e.departureDate) : null,
    lastMedicalVisitDate: canEdit ? iso(e.lastMedicalVisitDate) : null,
    lastProfessionalInterviewDate: canEdit
      ? iso(e.lastProfessionalInterviewDate)
      : null,
    dpcLastDate: canEdit ? iso(e.dpcLastDate) : null,
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

  // Échéances RH à venir — calculées uniquement pour les titulaires (sensible).
  const deadlines = canEdit
    ? upcomingDeadlines(employees.filter((e) => e.isActive), todayIso)
    : [];

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

  // Édition des événements = titulaires uniquement (comme le reste de la page).
  const canManageEvents = canEdit;

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
          <p className="text-sm text-muted-foreground">
            {canEdit ? "Gérer l'équipe de la pharmacie" : "L'équipe de la pharmacie"} ·{" "}
            {rows.length} collaborateur{rows.length > 1 ? "s" : ""}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Colonne gauche : échéances RH (titulaires) + tableau de l'équipe */}
        <div className="min-w-0 flex-1 space-y-4">
          {canEdit && <HrDeadlinesCard deadlines={deadlines} />}
          <EmployeesTable
            employees={rows}
            roleByEmployeeId={roleByEmployeeId}
            currentUserRole={session.user.role}
            canEdit={canEdit}
          />
        </div>

        {/* Colonne droite : la vie de l'équipe (événements animés) */}
        <div className="lg:w-[460px] xl:w-[500px] lg:shrink-0">
          <TeamEventsPanel events={eventRows} canManage={canManageEvents} />
        </div>
      </div>
    </div>
  );
}
