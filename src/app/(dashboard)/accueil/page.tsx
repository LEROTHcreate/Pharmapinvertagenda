import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AccueilView } from "@/components/accueil/AccueilView";
import {
  SLOT_HOURS,
  TIME_SLOTS,
  TASK_LABELS,
  ABSENCE_LABELS,
} from "@/types";
import type { TaskCode, AbsenceCode } from "@prisma/client";
import { toIsoDate } from "@/lib/planning-utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accueil — PharmaPlanning" };

type Entry = {
  employeeId: string;
  timeSlot: string;
  type: "TASK" | "ABSENCE";
  taskCode: TaskCode | null;
  absenceCode: AbsenceCode | null;
};

function labelFor(e: Entry): { label: string; isAbsence: boolean } {
  if (e.type === "TASK" && e.taskCode)
    return { label: TASK_LABELS[e.taskCode], isAbsence: false };
  if (e.type === "ABSENCE" && e.absenceCode)
    return { label: ABSENCE_LABELS[e.absenceCode], isAbsence: true };
  return { label: "", isAbsence: false };
}

export default async function AccueilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = session.user.role === "ADMIN";

  const today = new Date();
  const todayIso = toIsoDate(today);
  const dayStart = new Date(`${todayIso}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const [sessionEmployee, todayEntries] = await Promise.all([
    session.user.employeeId
      ? prisma.employee.findUnique({
          where: { id: session.user.employeeId },
          select: { firstName: true },
        })
      : Promise.resolve(null),
    prisma.scheduleEntry.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        date: { gte: dayStart, lt: dayEnd },
      },
      select: {
        employeeId: true,
        timeSlot: true,
        type: true,
        taskCode: true,
        absenceCode: true,
      },
    }),
  ]);

  // Présents = employés distincts avec au moins une TÂCHE aujourd'hui.
  const presentSet = new Set<string>();
  for (const e of todayEntries as Entry[]) {
    if (e.type === "TASK") presentSet.add(e.employeeId);
  }
  const teamPresent = presentSet.size;

  // Ma journée : blocs contigus (même tâche/absence) compactés.
  let myDay: {
    hours: number;
    blocks: Array<{ from: string; to: string; label: string; isAbsence: boolean }>;
  } | null = null;

  if (session.user.employeeId) {
    const empId = session.user.employeeId;
    const bySlot = new Map<string, Entry>();
    let taskSlots = 0;
    for (const e of todayEntries as Entry[]) {
      if (e.employeeId !== empId) continue;
      bySlot.set(e.timeSlot, e);
      if (e.type === "TASK") taskSlots++;
    }
    const blocks: Array<{ from: string; to: string; label: string; isAbsence: boolean }> = [];
    let cur: { from: string; e: Entry } | null = null;
    const slotEnd = (slot: string) => {
      const [h, m] = slot.split(":").map(Number);
      const end = h * 60 + m + 30;
      return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    };
    for (const slot of TIME_SLOTS) {
      const e = bySlot.get(slot) ?? null;
      const same =
        cur &&
        e &&
        e.type === cur.e.type &&
        e.taskCode === cur.e.taskCode &&
        e.absenceCode === cur.e.absenceCode;
      if (same) continue;
      if (cur) blocks.push({ from: cur.from, to: slot, ...labelFor(cur.e) });
      cur = e ? { from: slot, e } : null;
    }
    if (cur)
      blocks.push({
        from: cur.from,
        to: slotEnd(TIME_SLOTS[TIME_SLOTS.length - 1]),
        ...labelFor(cur.e),
      });
    myDay = { hours: taskSlots * SLOT_HOURS, blocks };
  }

  const dateLabel = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <AccueilView
      firstName={sessionEmployee?.firstName ?? session.user.name?.split(" ")[0] ?? null}
      dateLabel={dateLabel}
      isAdmin={isAdmin}
      myDay={myDay}
      teamPresent={teamPresent}
    />
  );
}
