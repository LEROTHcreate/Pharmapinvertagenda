import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canApplyTemplates } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isoWeekStartUTC } from "@/lib/work-hours";
import { TIME_SLOTS, type ScheduleEntryDTO } from "@/types";
import { ScheduleType, type TaskCode, type EmployeeStatus } from "@prisma/client";
import {
  staffingForSlot,
  staffingLevel,
  indexEntriesByEmployee,
  type StaffingLevel,
} from "@/lib/planning-utils";
import { GabaritsList, type GabaritRow } from "@/components/templates/GabaritsList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gabarits · PharmaPlanning" };

/**
 * Construit l'aperçu « heatmap » d'un gabarit : pour chaque jour (0-5) × créneau
 * horaire, le nombre de collaborateurs affectés à une TÂCHE. Sert à reconnaître
 * la forme d'un gabarit d'un coup d'œil sur sa carte. TASK uniquement (les
 * absences ne représentent pas de la couverture).
 */
function buildPreview(
  entries: Array<{ dayOfWeek: number; timeSlot: string; type: ScheduleType }>
): number[][] {
  const slotIndex = new Map(TIME_SLOTS.map((s, i) => [s, i]));
  const grid: number[][] = Array.from({ length: 6 }, () =>
    new Array<number>(TIME_SLOTS.length).fill(0)
  );
  for (const e of entries) {
    if (e.type !== ScheduleType.TASK) continue;
    const si = slotIndex.get(e.timeSlot);
    if (si === undefined || e.dayOfWeek < 0 || e.dayOfWeek > 5) continue;
    grid[e.dayOfWeek][si] += 1;
  }
  return grid;
}

/** "08:30" → "8h30" (affichage FR). */
function frTime(slot: string): string {
  const [h, m] = slot.split(":");
  return `${Number(h)}h${m}`;
}

/** Ajoute 30 min à un créneau "HH:MM" → "HH:MM" (heure de fin du créneau). */
function slotEnd(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const t = h * 60 + m + 30;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Amplitude horaire du gabarit : du PREMIER au DERNIER créneau réellement
 * travaillé (tous jours confondus). C'est une info neutre et fiable — elle ne
 * dépend d'aucun horaire d'ouverture (contrairement à un « sous-effectif » qui
 * comptait à tort les créneaux de préparation avant ouverture).
 */
function amplitude(preview: number[][]): { start: string; end: string } | null {
  let min = Infinity;
  let max = -1;
  for (const row of preview) {
    for (let i = 0; i < row.length; i++) {
      if (row[i] > 0) {
        if (i < min) min = i;
        if (i > max) max = i;
      }
    }
  }
  if (max < 0) return null;
  return { start: frTime(TIME_SLOTS[min]), end: frTime(slotEnd(TIME_SLOTS[max])) };
}

/** Nombre de jours (0-6) où au moins un collaborateur travaille. */
function daysCovered(preview: number[][]): number {
  return preview.filter((row) => row.some((v) => v > 0)).length;
}

/**
 * Résumé d'effectif COMPTOIR d'un gabarit — mêmes règles que le planning
 * (`staffingForSlot` : pharmaciens + préparateurs + étudiants sur une vraie
 * tâche ; REMPLACEMENT compté ; ECHANGE et COMMANDE exclus).
 *
 * Pour chaque jour, on ne regarde QUE la fenêtre de présence comptoir (du 1er au
 * dernier créneau avec effectif > 0) → on ne signale pas comme « sous-effectif »
 * les créneaux de préparation avant ouverture / après fermeture (info neutre,
 * cohérente avec l'amplitude affichée). `staffingMin` = pire couverture comptoir
 * pendant les heures travaillées ; `understaffedSlots` = créneaux sous le seuil.
 */
function computeTemplateStaffing(
  entries: Array<{
    employeeId: string;
    dayOfWeek: number;
    timeSlot: string;
    type: ScheduleType;
    taskCode: TaskCode | null;
  }>,
  statusById: Map<string, EmployeeStatus>,
  minStaff: number
): {
  staffingMin: number | null;
  staffingPeak: number;
  understaffedSlots: number;
  staffingLevel: StaffingLevel | null;
} {
  const allIds = Array.from(statusById.keys());
  const counterIds = allIds.filter((id) => {
    const s = statusById.get(id);
    return s === "PHARMACIEN" || s === "PREPARATEUR" || s === "ETUDIANT";
  });
  // Index factice : la « date » est le numéro du jour (0-5).
  const fake: ScheduleEntryDTO[] = entries.map((e, i) => ({
    id: String(i),
    employeeId: e.employeeId,
    date: String(e.dayOfWeek),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: null,
    notes: null,
  }));
  const index = indexEntriesByEmployee(fake);

  let staffingMin: number | null = null;
  let staffingPeak = 0;
  let understaffed = 0;
  for (let day = 0; day <= 5; day++) {
    const perSlot = TIME_SLOTS.map((slot) =>
      staffingForSlot(String(day), slot, counterIds, index, allIds)
    );
    let first = -1;
    let last = -1;
    perSlot.forEach((n, i) => {
      if (n > 0) {
        if (first < 0) first = i;
        last = i;
      }
    });
    if (first < 0) continue; // Aucune présence comptoir ce jour → ignoré.
    for (let i = first; i <= last; i++) {
      const n = perSlot[i];
      if (n > staffingPeak) staffingPeak = n;
      if (staffingMin === null || n < staffingMin) staffingMin = n;
      if (n < minStaff) understaffed++;
    }
  }
  return {
    staffingMin,
    staffingPeak,
    understaffedSlots: understaffed,
    staffingLevel: staffingMin === null ? null : staffingLevel(staffingMin, minStaff),
  };
}

export default async function GabaritsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canApplyTemplates(session.user.role)) redirect("/planning");

  const [templates, team, pharmacy] = await Promise.all([
    prisma.weekTemplate.findMany({
      where: { pharmacyId: session.user.pharmacyId },
      orderBy: [
        { isDefault: "desc" },
        { category: "asc" },
        { weekType: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        name: true,
        weekType: true,
        category: true,
        description: true,
        isDefault: true,
        updatedAt: true,
        entries: {
          select: {
            employeeId: true,
            dayOfWeek: true,
            timeSlot: true,
            type: true,
            taskCode: true,
          },
        },
      },
    }),
    // Équipe active — pour l'import Excel (matching prénoms + compatibilité rôle)
    // ET pour calculer l'effectif comptoir (statut de chaque collaborateur).
    prisma.employee.findMany({
      where: { pharmacyId: session.user.pharmacyId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, status: true },
    }),
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { minStaff: true },
    }),
  ]);

  const minStaff = pharmacy?.minStaff ?? 4;
  const statusById = new Map<string, EmployeeStatus>(
    team.map((e) => [e.id, e.status])
  );

  const rows: GabaritRow[] = templates.map((t) => {
    const preview = buildPreview(t.entries);
    const taskEntries = t.entries.filter((e) => e.type === ScheduleType.TASK);
    const staffing = computeTemplateStaffing(t.entries, statusById, minStaff);
    return {
      id: t.id,
      name: t.name,
      weekType: t.weekType,
      category: t.category,
      description: t.description,
      isDefault: t.isDefault,
      entryCount: t.entries.length,
      updatedAt: t.updatedAt.toISOString(),
      preview,
      // 1 créneau = 30 min = 0,5 h ; on ne compte que les TÂCHES (pas les absences).
      weeklyHours: taskEntries.length * 0.5,
      peopleCount: new Set(taskEntries.map((e) => e.employeeId)).size,
      amplitude: amplitude(preview),
      daysCovered: daysCovered(preview),
      // Effectif comptoir (règles planning) : min pendant les heures travaillées,
      // pic, créneaux sous le seuil, niveau de couleur.
      staffingMin: staffing.staffingMin,
      staffingPeak: staffing.staffingPeak,
      understaffedSlots: staffing.understaffedSlots,
      staffingLevel: staffing.staffingLevel,
    };
  });

  // Lundi ISO de la semaine courante — point de départ par défaut pour le
  // bouton « Appliquer un gabarit » directement depuis cette page.
  const currentWeekStart = isoWeekStartUTC(new Date()).toISOString().slice(0, 10);

  return (
    <div className="p-3 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Gabarits de semaine
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-3xl">
          Crée autant de gabarits que tu veux et classe-les selon tes besoins
          (« Standard », « Vacances scolaires », « Renfort été »…). Applique-les
          en un clic à n&apos;importe quelle semaine — les modifications manuelles
          sont préservées par défaut.
        </p>
      </div>

      <GabaritsList
        rows={rows}
        currentWeekStart={currentWeekStart}
        employees={team}
        minStaff={minStaff}
      />
    </div>
  );
}
