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

export default async function GabaritsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canApplyTemplates(session.user.role)) redirect("/planning");

  const templates = await prisma.weekTemplate.findMany({
    where: { pharmacyId: session.user.pharmacyId },
    orderBy: [{ category: "asc" }, { weekType: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      weekType: true,
      category: true,
      description: true,
      updatedAt: true,
      entries: {
        select: { dayOfWeek: true, timeSlot: true, type: true },
      },
    },
  });

  const rows: GabaritRow[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    weekType: t.weekType,
    category: t.category,
    description: t.description,
    entryCount: t.entries.length,
    updatedAt: t.updatedAt.toISOString(),
    preview: buildPreview(t.entries),
  }));

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
