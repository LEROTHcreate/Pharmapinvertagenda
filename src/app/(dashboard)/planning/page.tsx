import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canEditPlanning } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { startOfWeek, toIsoDate } from "@/lib/planning-utils";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { PlanningView } from "@/components/planning/PlanningView";
import { WelcomeBanner } from "@/components/planning/WelcomeBanner";
import { OnboardingEmptyState } from "@/components/planning/OnboardingEmptyState";
import {
  pickRandomGreeting,
  timeBasedHello,
} from "@/lib/daily-greeting";
import { upcomingTips } from "@/lib/planning-tips";
import { seasonalTips } from "@/lib/seasonal-staffing";
import { getCachedWeekEntries } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

/**
 * Détermine si la requête arrive "à froid" : nouvel onglet, bookmark, URL
 * tapée directement, restauration de session… Dans ce cas le `?week=` ou le
 * `?day=` éventuel vient d'un cache navigateur et ne reflète pas l'intention
 * du jour : on force la semaine courante.
 *
 * À l'inverse, quand la nav vient de l'app elle-même (clic prev/next, click
 * sur une cellule, partage de lien interne), le Referer est same-origin et
 * on respecte les params de l'URL.
 */
function isFreshEntry(): boolean {
  const h = headers();
  const referer = h.get("referer");
  if (!referer) return true;
  try {
    const ref = new URL(referer);
    const host = h.get("host") ?? "";
    return ref.host !== host;
  } catch {
    return true;
  }
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: { week?: string; day?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  // Arrivée à froid avec un ?week= ou ?day= bloqué → redirect vers la version
  // propre, qui re-render au jour courant.
  if (isFreshEntry() && (searchParams.week || searchParams.day)) {
    redirect("/planning");
  }

  const initialWeekStart = searchParams.week
    ? new Date(`${searchParams.week}T00:00:00`)
    : startOfWeek(new Date());
  const monday = startOfWeek(initialWeekStart);
  const weekStartIso = toIsoDate(monday);

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
    // Lecture CACHÉE (partagée avec /api/planning, invalidée par les mutations)
    // → plus de requête Postgres à chaque navigation sur cette page.
    getCachedWeekEntries(session.user.pharmacyId, weekStartIso),
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
  // Tips contextuels (ponts, veilles de fériés) sur les 7 prochains jours
  // → affichés dans le popover de l'étoile à droite du bandeau.
  // Tips du bandeau : événements proches (ponts, veilles de fériés) sur 7 j
  // + prévisions saisonnières (pics d'activité officine). On plafonne le
  // saisonnier à 3 pour ne pas noyer les rappels du jour dans la bulle.
  const tips = [
    ...upcomingTips(todayIso, 7),
    ...seasonalTips(todayIso, 14).slice(0, 3),
  ];

  return (
    <div className="space-y-2 sm:space-y-2.5">
      <WelcomeBanner
        firstName={firstName}
        hello={hello}
        phrase={phrase}
        color={sessionEmployee?.displayColor}
        avatarId={sessionUser?.avatarId ?? null}
        tips={tips}
      />
      {employeesDTO.length === 0 ? (
        // Officine sans aucun collaborateur (juste après création) → onboarding
        // guidé plutôt qu'une grille vide déroutante.
        <OnboardingEmptyState isAdmin={canEditPlanning(session.user.role)} />
      ) : (
        <PlanningView
          initialWeekStart={weekStartIso}
          initialDayIndex={initialDayIndex}
          employees={employeesDTO}
          initialEntries={initialEntries}
          role={session.user.role}
          minStaff={pharmacy?.minStaff ?? 4}
          currentEmployeeId={session.user.employeeId ?? null}
        />
      )}
    </div>
  );
}
