import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminLevel } from "@/lib/permissions";
import {
  DEFAULT_CHECKLIST,
  safeChecklistDate,
  checklistToday,
  type ChecklistItemDTO,
  type ChecklistCheckDTO,
} from "@/lib/checklist";
import { ChecklistView } from "@/components/checklist/ChecklistView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checklist — PharmaPlanning" };

export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const pharmacyId = session.user.pharmacyId;
  const date = safeChecklistDate(searchParams.date);

  // 1re utilisation → on installe la liste par défaut (l'admin l'ajustera).
  const count = await prisma.checklistItem.count({ where: { pharmacyId } });
  if (count === 0) {
    const orderByMoment: Record<string, number> = {};
    await prisma.checklistItem.createMany({
      data: DEFAULT_CHECKLIST.map((it) => {
        const order = orderByMoment[it.moment] ?? 0;
        orderByMoment[it.moment] = order + 1;
        return {
          pharmacyId,
          label: it.label,
          moment: it.moment,
          needsNote: it.needsNote ?? false,
          order,
        };
      }),
    });
  }

  const [items, checks] = await Promise.all([
    prisma.checklistItem.findMany({
      where: { pharmacyId, isActive: true },
      orderBy: [{ moment: "asc" }, { order: "asc" }],
      select: { id: true, label: true, moment: true, order: true, needsNote: true },
    }),
    prisma.checklistCheck.findMany({
      where: { pharmacyId, date: new Date(`${date}T00:00:00.000Z`) },
      select: {
        itemId: true,
        done: true,
        note: true,
        checkedByName: true,
        checkedAt: true,
      },
    }),
  ]);

  const itemsDTO: ChecklistItemDTO[] = items;
  const checksDTO: ChecklistCheckDTO[] = checks.map((c) => ({
    itemId: c.itemId,
    done: c.done,
    note: c.note,
    checkedByName: c.checkedByName,
    checkedAt: c.checkedAt ? c.checkedAt.toISOString() : null,
  }));

  return (
    <div className="p-3 md:p-4 lg:p-6">
      <ChecklistView
        key={date}
        items={itemsDTO}
        checks={checksDTO}
        date={date}
        today={checklistToday()}
        canManage={isAdminLevel(session.user.role)}
      />
    </div>
  );
}
