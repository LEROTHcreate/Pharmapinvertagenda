import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canApplyTemplates } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isoWeekStartUTC } from "@/lib/work-hours";
import { TIME_SLOTS } from "@/types";
import { ScheduleType } from "@prisma/client";
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

/**
 * Compte les créneaux OCCUPÉS mais sous l'effectif minimum (0 < effectif <
 * minStaff). On ignore les créneaux à 0 (hors ouverture, normaux) pour ne pas
 * générer de fausses alertes sur les heures non travaillées.
 */
function countUnderstaffed(preview: number[][], minStaff: number): number {
  let n = 0;
  for (const row of preview) {
    for (const v of row) {
      if (v > 0 && v < minStaff) n++;
    }
  }
  return n;
}

export default async function GabaritsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canApplyTemplates(session.user.role)) redirect("/planning");

  const [pharmacy, templates] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: { minStaff: true },
    }),
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
          select: { employeeId: true, dayOfWeek: true, timeSlot: true, type: true },
        },
      },
    }),
  ]);
  const minStaff = pharmacy?.minStaff ?? 4;

  const rows: GabaritRow[] = templates.map((t) => {
    const preview = buildPreview(t.entries);
    const taskEntries = t.entries.filter((e) => e.type === ScheduleType.TASK);
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
      understaffedSlots: countUnderstaffed(preview, minStaff),
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

      <GabaritsList rows={rows} currentWeekStart={currentWeekStart} />
    </div>
  );
}
