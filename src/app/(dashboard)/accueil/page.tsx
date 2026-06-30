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
import { toIsoDate, startOfWeek, weekDays } from "@/lib/planning-utils";
import { getMessagesUnreadCounts } from "@/lib/dashboard-data";

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
  const tomorrowIso = toIsoDate(new Date(today.getTime() + 24 * 3600 * 1000));
  const dayStart = new Date(`${todayIso}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  // Semaine en cours (Lun → Sam) pour le récap perso.
  const monday = startOfWeek(today);
  const weekStart = new Date(`${toIsoDate(monday)}T00:00:00Z`);
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 3600 * 1000);
  const weekDatesIso = weekDays(monday).map(toIsoDate);

  const [sessionEmployee, todayEntries, weekEntries, pendingAbsences, unread] =
    await Promise.all([
      session.user.employeeId
        ? prisma.employee.findUnique({
            where: { id: session.user.employeeId },
            select: { firstName: true, weeklyHours: true },
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
      // Entrées de la semaine de l'utilisateur (récap heures + prochain créneau).
      session.user.employeeId
        ? prisma.scheduleEntry.findMany({
            where: {
              employeeId: session.user.employeeId,
              date: { gte: weekStart, lt: weekEnd },
            },
            select: {
              date: true,
              timeSlot: true,
              type: true,
              taskCode: true,
              absenceCode: true,
            },
          })
        : Promise.resolve([]),
      // Absences à valider (admin uniquement).
      isAdmin
        ? prisma.absenceRequest.count({
            where: { pharmacyId: session.user.pharmacyId, status: "PENDING" },
          })
        : Promise.resolve(0),
      // Messages non lus (swap + texte).
      getMessagesUnreadCounts(session.user.id),
    ]);

  const unreadMessages = unread.swap + unread.text;

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

  // Récap semaine (heures comptabilisées = TÂCHE + absences rémunérées) +
  // prochain créneau (1ère TÂCHE d'un jour à venir cette semaine).
  let myWeek: { done: number; contract: number } | null = null;
  let nextSlot: { when: string; from: string; label: string } | null = null;
  if (session.user.employeeId && sessionEmployee) {
    const PAID = new Set(["CONGE", "MALADIE", "FORMATION_ABS"]);
    type WeekEntry = {
      date: Date;
      timeSlot: string;
      type: "TASK" | "ABSENCE";
      taskCode: TaskCode | null;
      absenceCode: AbsenceCode | null;
    };
    const wk = weekEntries as WeekEntry[];
    let slots = 0;
    const byDay = new Map<string, WeekEntry[]>();
    for (const e of wk) {
      if (
        e.type === "TASK" ||
        (e.type === "ABSENCE" && e.absenceCode && PAID.has(e.absenceCode))
      )
        slots++;
      const iso = e.date.toISOString().slice(0, 10);
      const arr = byDay.get(iso);
      if (arr) arr.push(e);
      else byDay.set(iso, [e]);
    }
    myWeek = { done: slots * SLOT_HOURS, contract: sessionEmployee.weeklyHours };

    for (const iso of weekDatesIso) {
      if (iso <= todayIso) continue;
      const tasks = (byDay.get(iso) ?? []).filter(
        (e) => e.type === "TASK" && e.taskCode
      );
      if (tasks.length === 0) continue;
      tasks.sort((a, b) => (a.timeSlot < b.timeSlot ? -1 : 1));
      const first = tasks[0];
      const when =
        iso === tomorrowIso
          ? "demain"
          : new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
            });
      nextSlot = { when, from: first.timeSlot, label: TASK_LABELS[first.taskCode!] };
      break;
    }
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
      myWeek={myWeek}
      nextSlot={nextSlot}
      teamPresent={teamPresent}
      pendingAbsences={pendingAbsences}
      unreadMessages={unreadMessages}
    />
  );
}
