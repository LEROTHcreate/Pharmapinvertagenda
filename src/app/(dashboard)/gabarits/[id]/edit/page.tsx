import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canApplyTemplates } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TemplateView } from "@/components/templates/TemplateView";
import type { EmployeeDTO } from "@/types";
import type { TemplateEntryDTO } from "@/components/templates/TemplateView";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canApplyTemplates(session.user.role)) redirect("/planning");

  const [template, pharmacy] = await Promise.all([
    prisma.weekTemplate.findFirst({
      where: { id: params.id, pharmacyId: session.user.pharmacyId },
      include: { entries: true },
    }),
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { minStaff: true },
    }),
  ]);
  if (!template) redirect("/gabarits");

  const employees = await prisma.employee.findMany({
    where: { pharmacyId: session.user.pharmacyId, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      weeklyHours: true,
      displayColor: true,
      displayOrder: true,
    },
  });

  const initialEntries: TemplateEntryDTO[] = template.entries.map((e) => ({
    employeeId: e.employeeId,
    dayOfWeek: e.dayOfWeek,
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
  }));

  const employeesDTO: EmployeeDTO[] = employees;

  return (
    <TemplateView
      templateId={template.id}
      weekType={template.weekType}
      initialName={template.name}
      initialCategory={template.category}
      initialDescription={template.description}
      minStaff={pharmacy?.minStaff ?? 4}
      employees={employeesDTO}
      initialEntries={initialEntries}
    />
  );
}
