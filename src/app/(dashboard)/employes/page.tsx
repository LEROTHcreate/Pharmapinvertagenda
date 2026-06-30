import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EmployeesTable } from "@/components/employees/EmployeesTable";
import type { EmployeeRowData } from "@/components/employees/EmployeesTable";
import { HrDeadlinesCard } from "@/components/employees/HrDeadlinesCard";
import { upcomingDeadlines } from "@/lib/hr-deadlines";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Équipe — PharmaPlanning",
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function EmployesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/planning");

  const employees = await prisma.employee.findMany({
    where: { pharmacyId: session.user.pharmacyId },
    orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      weeklyHours: true,
      displayColor: true,
      displayOrder: true,
      isActive: true,
      hireDate: true,
      contractType: true,
      contractEndDate: true,
      trialEndDate: true,
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
    displayColor: e.displayColor,
    displayOrder: e.displayOrder,
    isActive: e.isActive,
    hireDate: iso(e.hireDate),
    contractType: e.contractType,
    contractEndDate: iso(e.contractEndDate),
    trialEndDate: iso(e.trialEndDate),
    lastMedicalVisitDate: iso(e.lastMedicalVisitDate),
    lastProfessionalInterviewDate: iso(e.lastProfessionalInterviewDate),
    dpcLastDate: iso(e.dpcLastDate),
  }));

  // Échéances RH à venir (sur les collaborateurs actifs uniquement).
  const todayIso = new Date().toISOString().slice(0, 10);
  const deadlines = upcomingDeadlines(
    employees.filter((e) => e.isActive),
    todayIso
  );

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-6xl space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
          <p className="text-sm text-muted-foreground">
            Gérer l&apos;équipe de la pharmacie · {rows.length} collaborateur
            {rows.length > 1 ? "s" : ""}
          </p>
        </div>
      </header>

      <HrDeadlinesCard deadlines={deadlines} />

      <EmployeesTable employees={rows} />
    </div>
  );
}
