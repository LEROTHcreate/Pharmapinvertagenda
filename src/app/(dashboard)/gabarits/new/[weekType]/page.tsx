import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TemplateView } from "@/components/templates/TemplateView";
import type { EmployeeDTO } from "@/types";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage({
  params,
}: {
  params: { weekType: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/planning");

  const weekType = params.weekType.toUpperCase();
  if (weekType !== "S1" && weekType !== "S2") redirect("/gabarits");

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

  // Suggestion de nom basée sur le nb de gabarits existants pour ce type
  const existing = await prisma.weekTemplate.count({
    where: { pharmacyId: session.user.pharmacyId, weekType: weekType as "S1" | "S2" },
  });
  const suggestion =
    existing === 0
      ? `Semaine type ${weekType}`
      : `Semaine type ${weekType} (${existing + 1})`;

  return (
    <TemplateView
      weekType={weekType as "S1" | "S2"}
      initialName={suggestion}
      employees={employees as EmployeeDTO[]}
      initialEntries={[]}
    />
  );
}
