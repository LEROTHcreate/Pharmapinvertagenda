import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  startOfWeek,
  toIsoDate,
  indexEntriesByEmployee,
} from "@/lib/planning-utils";
import {
  getCachedWeekEntries,
  getPendingAbsencesCount,
  getPendingUsersCount,
} from "@/lib/dashboard-data";
import { upcomingTips } from "@/lib/planning-tips";
import { seasonalTips } from "@/lib/seasonal-staffing";
import { analyzeCoverage } from "@/lib/coverage-analysis";
import { getHolidaysFR } from "@/lib/holidays-fr";
import { TIME_SLOTS, ABSENCE_LABELS } from "@/types";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import {
  InfosView,
  type AbsentsDay,
  type UpcomingHoliday,
} from "@/components/infos/InfosView";

export const dynamic = "force-dynamic";

/** Ajoute `n` jours à une date (copie, sans muter l'original). */
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Centre « Infos & conseils » — page dédiée qui regroupe tout le contextuel
 * du planning (validations à traiter, sous-effectif, conseils d'anticipation,
 * fériés à venir). Les calculs lourds (analyse de couverture) vivent ICI et
 * ne tournent donc plus à chaque modification du planning.
 */
export default async function InfosPage() {
  const session = await auth();
  if (!session?.user) return null;

  const isAdmin = session.user.role === "ADMIN";
  const pharmacyId = session.user.pharmacyId;

  const monday = startOfWeek(new Date());
  const weekStartIso = toIsoDate(monday);
  // Lundi → samedi (l'officine est fermée le dimanche).
  const weekDates = Array.from({ length: 6 }, (_, i) =>
    toIsoDate(addDays(monday, i))
  );
  const todayIso = toIsoDate(new Date());

  // Données de base (parallélisées). Les compteurs de validation ne concernent
  // que les admins → on évite les requêtes inutiles pour un collaborateur.
  const [employees, rawEntries, pharmacy, pendingAbsences, pendingUsers] =
    await Promise.all([
      prisma.employee.findMany({
        where: { pharmacyId, isActive: true },
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
      getCachedWeekEntries(pharmacyId, weekStartIso),
      prisma.pharmacy.findUnique({
        where: { id: pharmacyId },
        select: { minStaff: true },
      }),
      isAdmin ? getPendingAbsencesCount(pharmacyId) : Promise.resolve(0),
      isAdmin ? getPendingUsersCount(pharmacyId) : Promise.resolve(0),
    ]);

  const employeesDTO = employees as EmployeeDTO[];

  const entries: ScheduleEntryDTO[] = rawEntries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    date: toIsoDate(e.date),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: e.notes,
  }));

  const index = indexEntriesByEmployee(entries);
  const minStaff = pharmacy?.minStaff ?? 4;

  // ─── Manquements de couverture (admin uniquement) ────────────────
  const openSlots = TIME_SLOTS.filter((s) => s >= "08:30" && s < "20:00");
  const coverageWarnings = isAdmin
    ? analyzeCoverage(employeesDTO, weekDates, index, openSlots, minStaff)
    : [];

  // ─── Absents, par jour de la semaine ─────────────────────────────
  const absentsByDay: AbsentsDay[] = weekDates.map((date) => {
    const people = employeesDTO
      .map((emp) => {
        const day = index.get(emp.id)?.get(date);
        const absence = day
          ? Array.from(day.values()).find((e) => e.type === "ABSENCE")
          : null;
        if (!absence) return null;
        return {
          id: emp.id,
          name: `${emp.firstName} ${emp.lastName.charAt(0)}.`,
          label: absence.absenceCode ? ABSENCE_LABELS[absence.absenceCode] : null,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return {
      date,
      dateLabel: new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
      }),
      people,
    };
  });

  // ─── Conseils : ponts / veilles de fériés + prévisions saisonnières ──
  const tips = [
    ...upcomingTips(todayIso, 7),
    ...seasonalTips(todayIso, 21).slice(0, 5),
  ];

  // ─── Prochains jours fériés (officine fermée) ────────────────────
  const year = Number(todayIso.slice(0, 4));
  const holidays: UpcomingHoliday[] = [
    ...getHolidaysFR(year),
    ...getHolidaysFR(year + 1),
  ]
    .filter((h) => h.date >= todayIso)
    .slice(0, 6)
    .map((h) => ({
      date: h.date,
      name: h.name,
      dateLabel: new Date(`${h.date}T00:00:00`).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      daysUntil: Math.round(
        (new Date(`${h.date}T00:00:00Z`).getTime() -
          new Date(`${todayIso}T00:00:00Z`).getTime()) /
          86400000
      ),
    }));

  const weekLabel = `semaine du ${monday.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  })}`;

  return (
    <InfosView
      isAdmin={isAdmin}
      weekLabel={weekLabel}
      coverageWarnings={coverageWarnings}
      absentsByDay={absentsByDay}
      tips={tips}
      holidays={holidays}
      pending={{ absences: pendingAbsences, users: pendingUsers }}
    />
  );
}
