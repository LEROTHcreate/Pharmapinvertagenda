import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCachedWeekEntries } from "@/lib/dashboard-data";
import {
  startOfWeek,
  toIsoDate,
  weekDays,
  indexEntriesByEmployee,
  weekUnderstaffing,
  weeklyTaskHours,
} from "@/lib/planning-utils";
import type { ScheduleEntryDTO } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/assistant/insights — « Hygie proactif ».
 *
 * Retourne quelques constats basés sur les VRAIES données de l'officine (semaine
 * en cours), que la bulle Hygie surface d'elle-même : absences à valider,
 * créneaux en sous-effectif, dépassements de contrat. Admin uniquement pour
 * l'instant (ce sont des infos de pilotage). Chaque insight peut porter un lien
 * cliquable vers la page concernée.
 */
type Insight = { text: string; href?: string };

async function GET__impl() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Réservé aux profils qui pilotent (titulaire / manageur / créateur).
  if (!isAdminLevel(session.user.role)) {
    return NextResponse.json({ insights: [] });
  }

  const pharmacyId = session.user.pharmacyId;
  const monday = startOfWeek(new Date());
  const weekStartIso = toIsoDate(monday);
  const dayDates = weekDays(monday).map(toIsoDate);

  const [employees, entryRows, pharmacy, pendingCount] = await Promise.all([
    prisma.employee.findMany({
      where: { pharmacyId, isActive: true },
      select: { id: true, firstName: true, status: true, weeklyHours: true },
    }),
    getCachedWeekEntries(pharmacyId, weekStartIso),
    prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { minStaff: true },
    }),
    prisma.absenceRequest.count({ where: { pharmacyId, status: "PENDING" } }),
  ]);

  const insights: Insight[] = [];

  // ── 1) Absences à valider (actionnable en priorité) ──
  if (pendingCount > 0) {
    insights.push({
      text: `${pendingCount} demande${pendingCount > 1 ? "s" : ""} d'absence ${
        pendingCount > 1 ? "attendent" : "attend"
      } ta validation.`,
      href: "/absences",
    });
  }

  // Index des créneaux de la semaine (pour effectif + heures).
  const dtoEntries: ScheduleEntryDTO[] = entryRows.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    date: toIsoDate(e.date),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: e.notes,
  }));
  const index = indexEntriesByEmployee(dtoEntries);
  const minStaff = pharmacy?.minStaff ?? 4;
  const counterIds = employees
    .filter(
      (e) =>
        e.status === "PHARMACIEN" ||
        e.status === "PREPARATEUR" ||
        e.status === "ETUDIANT"
    )
    .map((e) => e.id);
  const allIds = employees.map((e) => e.id);

  // ── 2) Sous-effectif cette semaine (le pire trou) ──
  const coverage = weekUnderstaffing(dayDates, counterIds, index, minStaff, allIds);
  if (coverage.length > 0) {
    // On met en avant un créneau CRITIQUE en priorité, sinon le premier trou.
    let worstDay = coverage[0].dayIndex;
    let worstHole = coverage[0].holes[0];
    for (const d of coverage) {
      for (const h of d.holes) {
        if (h.level === "critical" && worstHole.level !== "critical") {
          worstDay = d.dayIndex;
          worstHole = h;
        }
      }
    }
    const totalHoles = coverage.reduce((s, d) => s + d.holes.length, 0);
    const dayLabel = new Date(
      `${dayDates[worstDay]}T12:00:00`
    ).toLocaleDateString("fr-FR", { weekday: "long" });
    insights.push({
      text: `Sous-effectif ${dayLabel} ${worstHole.from}–${worstHole.to} (${worstHole.minCount}/${minStaff} au comptoir)${
        totalHoles > 1 ? ` + ${totalHoles - 1} autre${totalHoles - 1 > 1 ? "s" : ""} créneau${totalHoles - 1 > 1 ? "x" : ""}` : ""
      }.`,
      href: `/planning?day=${worstDay}&week=${weekStartIso}`,
    });
  }

  // ── 3) Dépassement de contrat notable (> 2h) ──
  let topName: string | null = null;
  let topDelta = 0;
  for (const e of employees) {
    const worked = weeklyTaskHours(e.id, dayDates, index);
    const delta = worked - e.weeklyHours;
    if (delta > 2 && delta > topDelta) {
      topDelta = delta;
      topName = e.firstName;
    }
  }
  if (topName) {
    insights.push({
      text: `${topName} dépasse son contrat de +${topDelta.toFixed(1)}h cette semaine.`,
      href: "/planning",
    });
  }

  return NextResponse.json({ insights: insights.slice(0, 4) });
}

export const GET = withErrorHandling(GET__impl);