import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canApplyTemplates } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  GabaritPrintView,
  type GabaritPrintEntry,
  type GabaritPrintEmployee,
} from "@/components/templates/GabaritPrintView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impression gabarit — PharmaPlanning" };

export default async function GabaritImprimerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { jour?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canApplyTemplates(session.user.role)) redirect("/planning");

  // ?jour=0..5 → n'imprimer QUE ce jour ; sinon la semaine entière.
  const jourNum = Number(searchParams.jour);
  const onlyDay =
    Number.isInteger(jourNum) && jourNum >= 0 && jourNum <= 5 ? jourNum : null;

  const [template, pharmacy, employees] = await Promise.all([
    prisma.weekTemplate.findFirst({
      where: { id: params.id, pharmacyId: session.user.pharmacyId },
      include: { entries: true },
    }),
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { name: true, minStaff: true },
    }),
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayColor: true,
        status: true,
      },
    }),
  ]);
  if (!template) redirect("/gabarits");

  const employeeDTO: GabaritPrintEmployee[] = employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName.charAt(0)}.`,
    color: e.displayColor,
    status: e.status,
  }));

  const entries: GabaritPrintEntry[] = template.entries.map((e) => ({
    dayOfWeek: e.dayOfWeek,
    employeeId: e.employeeId,
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
  }));

  return (
    <GabaritPrintView
      templateName={template.name}
      weekType={template.weekType}
      category={template.category}
      description={template.description}
      pharmacyName={pharmacy?.name ?? "Pharmacie"}
      employees={employeeDTO}
      entries={entries}
      onlyDay={onlyDay}
      minStaff={pharmacy?.minStaff ?? 4}
    />
  );
}
