import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  startOfWeek,
  toIsoDate,
  indexEntriesByEmployee,
  weeklyTaskHours,
} from "@/lib/planning-utils";
import { GARDE_TYPE_LABELS } from "@/lib/gardes";
import { isAdminLevel } from "@/lib/permissions";
import {
  getCachedWeekEntries,
  getPendingAbsencesCount,
  getPendingUsersCount,
} from "@/lib/dashboard-data";
import { upcomingTips } from "@/lib/planning-tips";
import { seasonalTips } from "@/lib/seasonal-staffing";
import { analyzeCoverage } from "@/lib/coverage-analysis";
import { analyzeCcnCompliance } from "@/lib/ccn-compliance";
import { getHolidaysFR } from "@/lib/holidays-fr";
import { getPharmacyNews, getMedicineAlerts } from "@/lib/pharmacy-news";
import { TIME_SLOTS, ABSENCE_LABELS } from "@/types";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import {
  InfosView,
  type AbsentsDay,
  type UpcomingHoliday,
  type UpcomingWish,
  type UpcomingGarde,
  type WorkAnniversary,
  type OvertimeItem,
} from "@/components/infos/InfosView";

export const dynamic = "force-dynamic";

/** Ajoute `n` jours à une date (copie, sans muter l'original). */
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Deux chiffres (jour/mois). */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Nombre de jours entiers entre deux dates ISO (bornes en UTC minuit). */
function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000
  );
}

/** Libellé jour + mois en toutes lettres (déterministe côté serveur). */
function labelDayMonth(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Centre « Infos & conseils » — page dédiée qui regroupe tout le contextuel
 * du planning (validations à traiter, sous-effectif, conseils d'anticipation,
 * fériés à venir). Les calculs lourds (analyse de couverture) vivent ICI et
 * ne tournent donc plus à chaque modification du planning.
 */
export default async function InfosPage({
  searchParams,
}: {
  searchParams?: { w?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  // Titulaires + Créateur (isAdminLevel) — le créateur doit voir le contenu
  // admin d'Infos (dépassement d'heures, sous-effectif, CCN…) au même titre.
  const isAdmin = isAdminLevel(session.user.role);
  const pharmacyId = session.user.pharmacyId;

  // Navigation par semaine : `?w` = décalage en semaines vs la semaine courante
  // (0 = cette semaine, 1 = semaine prochaine, négatif = passé récent). Borné
  // pour rester pertinent et éviter d'aller trop loin.
  const WEEK_MIN = -4;
  const WEEK_MAX = 26;
  const rawW = Number.parseInt(searchParams?.w ?? "0", 10);
  const weekOffset = Number.isFinite(rawW)
    ? Math.min(WEEK_MAX, Math.max(WEEK_MIN, rawW))
    : 0;

  const monday = addDays(startOfWeek(new Date()), weekOffset * 7);
  const weekStartIso = toIsoDate(monday);
  // Lundi → samedi (l'officine est fermée le dimanche).
  const weekDates = Array.from({ length: 6 }, (_, i) =>
    toIsoDate(addDays(monday, i))
  );

  // Date d'ancrage des fenêtres « à venir » (conseils saisonniers, ponts &
  // fériés, souhaits, gardes, anniversaires) : aujourd'hui pour la semaine
  // courante, sinon le lundi de la semaine consultée → on anticipe « comme si
  // on y était » (voir les conseils de la semaine/du mois d'après en amont).
  const anchorIso = weekOffset === 0 ? toIsoDate(new Date()) : weekStartIso;
  // Fenêtre « à venir » : de l'ancrage (minuit UTC) à J+14, pour les souhaits
  // de dispo et les gardes. Les colonnes sont en @db.Date → on compare en UTC.
  const anchorStart = new Date(`${anchorIso}T00:00:00.000Z`);
  const horizon = new Date(anchorStart);
  horizon.setUTCDate(horizon.getUTCDate() + 14);

  // Actu pharmacie (flux externes, cachés 1 h) — lancés en parallèle des
  // lectures BDD, awaited plus bas. Si un flux échoue → [] (section masquée).
  const newsPromise = getPharmacyNews();
  const alertsPromise = getMedicineAlerts();

  // Données de base (parallélisées). Les compteurs de validation ne concernent
  // que les admins → on évite les requêtes inutiles pour un collaborateur.
  const [
    employees,
    rawEntries,
    pharmacy,
    pendingAbsences,
    pendingUsers,
    rawWishes,
    rawGardes,
  ] = await Promise.all([
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
          hireDate: true,
        },
      }),
      getCachedWeekEntries(pharmacyId, weekStartIso),
      prisma.pharmacy.findUnique({
        where: { id: pharmacyId },
        select: { minStaff: true },
      }),
      isAdmin ? getPendingAbsencesCount(pharmacyId) : Promise.resolve(0),
      isAdmin ? getPendingUsersCount(pharmacyId) : Promise.resolve(0),
      // Souhaits de dispo à venir — utiles à l'admin qui bâtit le planning.
      isAdmin
        ? prisma.availabilityWish.findMany({
            where: { pharmacyId, date: { gte: anchorStart, lte: horizon } },
            orderBy: { date: "asc" },
            take: 12,
            select: {
              id: true,
              date: true,
              kind: true,
              note: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          })
        : Promise.resolve([]),
      // Prochaines gardes (visible par tous : savoir qui est de garde).
      prisma.garde.findMany({
        where: { pharmacyId, date: { gte: anchorStart } },
        orderBy: { date: "asc" },
        take: 4,
        select: {
          id: true,
          date: true,
          type: true,
          pharmacist: { select: { firstName: true, lastName: true } },
        },
      }),
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

  // ─── Conformité Convention collective (admin uniquement) ─────────
  // Repos quotidien 11 h, durée max jour/semaine, amplitude, pause, coupures,
  // repos hebdo, jours consécutifs. Sans contexte inter-semaines ici : le
  // repos hebdo dégrade en « à vérifier » (fallback prudent du moteur).
  const ccnViolations = isAdmin
    ? analyzeCcnCompliance(employeesDTO, weekDates, index)
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
    ...upcomingTips(anchorIso, 7),
    ...seasonalTips(anchorIso, 21).slice(0, 5),
  ];

  // ─── Prochains jours fériés (officine fermée) ────────────────────
  const year = Number(anchorIso.slice(0, 4));
  const holidays: UpcomingHoliday[] = [
    ...getHolidaysFR(year),
    ...getHolidaysFR(year + 1),
  ]
    .filter((h) => h.date >= anchorIso)
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
          new Date(`${anchorIso}T00:00:00Z`).getTime()) /
          86400000
      ),
    }));

  // ─── Souhaits de disponibilité à venir (admin) ──────────────────
  const upcomingWishes: UpcomingWish[] = rawWishes.map((w) => {
    const iso = toIsoDate(w.date);
    return {
      id: w.id,
      employeeName: `${w.employee.firstName} ${w.employee.lastName.charAt(0)}.`,
      dateLabel: labelDayMonth(iso),
      daysUntil: daysBetweenIso(anchorIso, iso),
      kind: w.kind,
      note: w.note,
    };
  });

  // ─── Prochaines gardes (tous) ────────────────────────────────────
  const upcomingGardes: UpcomingGarde[] = rawGardes.map((g) => {
    const iso = toIsoDate(g.date);
    return {
      id: g.id,
      pharmacistName: `${g.pharmacist.firstName} ${g.pharmacist.lastName.charAt(0)}.`,
      dateLabel: labelDayMonth(iso),
      daysUntil: daysBetweenIso(anchorIso, iso),
      typeLabel: GARDE_TYPE_LABELS[g.type],
    };
  });

  // ─── Anniversaires d'ancienneté (30 prochains jours, ≥ 1 an) ─────
  const anniversaries: WorkAnniversary[] = employees
    .flatMap((emp) => {
      if (!emp.hireDate) return [];
      const hireIso = toIsoDate(emp.hireDate);
      const [hy, hm, hd] = hireIso.split("-").map(Number);
      const todayYear = Number(anchorIso.slice(0, 4));
      // Anniversaire de cette année ; si déjà passé, celui de l'an prochain.
      let year = todayYear;
      let annivIso = `${year}-${pad2(hm)}-${pad2(hd)}`;
      if (annivIso < anchorIso) {
        year = todayYear + 1;
        annivIso = `${year}-${pad2(hm)}-${pad2(hd)}`;
      }
      const years = year - hy;
      const daysUntil = daysBetweenIso(anchorIso, annivIso);
      if (daysUntil > 30 || years < 1) return [];
      return [
        {
          id: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          years,
          dateLabel: labelDayMonth(annivIso),
          daysUntil,
        } satisfies WorkAnniversary,
      ];
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // ─── Heures sup de la semaine en cours (admin) ───────────────────
  const overtime: OvertimeItem[] = isAdmin
    ? employeesDTO
        .map((emp) => {
          const worked = weeklyTaskHours(emp.id, weekDates, index);
          const overtimeHours =
            Math.round((worked - emp.weeklyHours) * 100) / 100;
          return {
            id: emp.id,
            name: `${emp.firstName} ${emp.lastName.charAt(0)}.`,
            contractHours: emp.weeklyHours,
            workedHours: worked,
            overtimeHours,
          } satisfies OvertimeItem;
        })
        .filter((o) => o.overtimeHours > 0)
        .sort((a, b) => b.overtimeHours - a.overtimeHours)
    : [];

  const weekLabel = `semaine du ${monday.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  })}`;

  const [news, alerts] = await Promise.all([newsPromise, alertsPromise]);

  return (
    <InfosView
      isAdmin={isAdmin}
      weekLabel={weekLabel}
      weekOffset={weekOffset}
      coverageWarnings={coverageWarnings}
      ccnViolations={ccnViolations}
      absentsByDay={absentsByDay}
      tips={tips}
      holidays={holidays}
      pending={{ absences: pendingAbsences, users: pendingUsers }}
      upcomingWishes={upcomingWishes}
      upcomingGardes={upcomingGardes}
      anniversaries={anniversaries}
      overtime={overtime}
      news={news}
      alerts={alerts}
    />
  );
}
