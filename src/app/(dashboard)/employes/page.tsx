import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EmployeesTable } from "@/components/employees/EmployeesTable";
import type { EmployeeRowData } from "@/components/employees/EmployeesTable";

export const metadata = {
  title: "Équipe — PharmaPlanning",
};

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
    hireDate: e.hireDate ? e.hireDate.toISOString().slice(0, 10) : null,
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
          <p className="text-sm text-muted-foreground">
            Gérer l&apos;équipe de la pharmacie · {rows.length} collaborateur
            {rows.length > 1 ? "s" : ""}
          </p>
        </div>
      </header>

      <EmployeesTable employees={rows} />
    </div>
  );
}
