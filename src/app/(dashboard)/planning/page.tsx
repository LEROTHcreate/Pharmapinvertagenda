import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startOfWeek, toIsoDate, weekDays } from "@/lib/planning-utils";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { PlanningView } from "@/components/planning/PlanningView";
import { WelcomeBanner } from "@/components/planning/WelcomeBanner";
import {
  pickRandomGreeting,
  timeBasedHello,
} from "@/lib/daily-greeting";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: { week?: string; day?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const initialWeekStart = searchParams.week
    ? new Date(`${searchParams.week}T00:00:00`)
    : startOfWeek(new Date());
  const monday = startOfWeek(initialWeekStart);
  const days = weekDays(monday);
  const weekStartIso = toIsoDate(monday);
  const weekEndIso = toIsoDate(days[5]);

  // Jour ciblé (?day=0..5 = lundi..samedi). Si absent ou hors range, on
  // laissera PlanningView basculer sur "aujourd'hui" automatiquement.
  const dayParam = searchParams.day ? Number(searchParams.day) : NaN;
  const initialDayIndex =
    Number.isInteger(dayParam) && dayParam >= 0 && dayParam <= 5
      ? dayParam
      : null;

  const [employees, entries, pharmacy, sessionEmployee, sessionUser] = await Promise.all([
    prisma.employee.findMany({
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
    }),
    prisma.scheduleEntry.findMany({
      where: {
        pharmacyId: session.user.pharmacyId,
        date: {
          gte: new Date(`${weekStartIso}T00:00:00Z`),
          lte: new Date(`${weekEndIso}T00:00:00Z`),
        },
      },
    }),
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { name: true, minStaff: true },
    }),
    // Fiche Employee de l'utilisateur connecté — fetchée séparément SANS le
    // filtre isActive, pour qu'un titulaire admin (parfois marqué inactif côté
    // planning) ait quand même son prénom + sa couleur dans le bandeau.
    session.user.employeeId
      ? prisma.employee.findUnique({
          where: { id: session.user.employeeId },
          select: { firstName: true, displayColor: true },
        })
      : Promise.resolve(null),
    // Avatar choisi par l'utilisateur — null par défaut (fallback initiale).
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avatarId: true },
    }),
  ]);

  const initialEntries: ScheduleEntryDTO[] = entries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    date: toIsoDate(e.date),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: e.notes,
  }));

  const employeesDTO: EmployeeDTO[] = employees;

  // ─── Bandeau "Bonjour [prénom]" + phrase du jour ─────────────────
  // Prénom : on privilégie la fiche Employee (champ firstName isolé). Sans
  // fiche, on tombe sur session.user.name — qui peut être au format
  // "Nom Prénom" (admin titulaire) → on prend alors le DERNIER mot, plus
  // probable d'être le prénom dans cette convention.
  const fallbackName = (session.user.name ?? "").trim();
  const fallbackParts = fallbackName.split(/\s+/);
  const fallbackFirstName =
    fallbackParts[fallbackParts.length - 1] ?? fallbackName;
  const firstName = sessionEmployee?.firstName ?? fallbackFirstName;
  const todayIso = toIsoDate(new Date());
  const phrase = pickRandomGreeting(todayIso);
  const hello = timeBasedHello();

  return (
    <div className="space-y-3 sm:space-y-4">
      <WelcomeBanner
        firstName={firstName}
        hello={hello}
        phrase={phrase}
        color={sessionEmployee?.displayColor}
        avatarId={sessionUser?.avatarId ?? null}
      />
      <PlanningView
        initialWeekStart={weekStartIso}
        initialDayIndex={initialDayIndex}
        employees={employeesDTO}
        initialEntries={initialEntries}
        role={session.user.role}
        minStaff={pharmacy?.minStaff ?? 4}
        currentEmployeeId={session.user.employeeId ?? null}
      />
    </div>
  );
}
