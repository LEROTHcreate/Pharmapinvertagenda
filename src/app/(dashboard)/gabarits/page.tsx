import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GabaritsList, type GabaritRow } from "@/components/templates/GabaritsList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gabarits · PharmaPlanning" };

export default async function GabaritsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/planning");

  const templates = await prisma.weekTemplate.findMany({
    where: { pharmacyId: session.user.pharmacyId },
    include: { _count: { select: { entries: true } } },
    orderBy: [{ weekType: "asc" }, { createdAt: "asc" }],
  });

  const rows: GabaritRow[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    weekType: t.weekType,
    entryCount: t._count.entries,
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Gabarits de semaine
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Crée autant de gabarits que tu veux pour chaque type de semaine
          (S1 / S2) — par exemple « S1 standard », « S1 vacances scolaires »,
          « S2 été »… puis applique-les en 1 clic à n&apos;importe quelle semaine.
        </p>
      </div>

      <GabaritsList rows={rows} />

      <div className="rounded-xl border border-violet-200/70 bg-violet-50/60 p-4 text-sm text-violet-900">
        💡 <strong>Astuce :</strong> Une fois tes gabarits créés, va sur la page
        Planning, clique sur «&nbsp;Appliquer un gabarit&nbsp;» en haut à droite,
        choisis lequel appliquer. Les modifications manuelles de la semaine
        sont préservées par défaut.
      </div>
    </div>
  );
}
