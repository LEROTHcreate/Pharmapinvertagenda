import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  UsersAdmin,
  type EmployeeOption,
  type UserRow,
} from "@/components/users/UsersAdmin";

export const metadata = {
  title: "Utilisateurs · PharmaPlanning",
};

export const dynamic = "force-dynamic";

export default async function UtilisateursPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/planning");

  const [users, employees] = await Promise.all([
    prisma.user.findMany({
      where: { pharmacyId: session.user.pharmacyId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        isActive: true,
        createdAt: true,
        reviewedAt: true,
        rejectionNote: true,
        employee: {
          select: { id: true, firstName: true, lastName: true, status: true },
        },
      },
    }),
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        user: { select: { id: true } },
      },
    }),
  ]);

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    reviewedAt: u.reviewedAt ? u.reviewedAt.toISOString() : null,
    rejectionNote: u.rejectionNote,
    isCurrentUser: u.id === session.user.id,
    employee: u.employee
      ? {
          id: u.employee.id,
          firstName: u.employee.firstName,
          lastName: u.employee.lastName,
          status: u.employee.status,
        }
      : null,
  }));

  const employeeOptions: EmployeeOption[] = employees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    status: e.status,
    linkedUserId: e.user?.id ?? null,
  }));

  return (
    <div className="max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approuvez les nouvelles demandes et gérez les accès au planning.
        </p>
      </header>

      <UsersAdmin users={rows} employees={employeeOptions} />
    </div>
  );
}
