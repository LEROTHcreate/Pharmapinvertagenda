import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getPharmacyNewsFull,
  getMedicineAlertsFull,
  searchPharmacyNews,
} from "@/lib/pharmacy-news";
import { ActualitesView } from "@/components/actualites/ActualitesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Actualités pharmacie — PharmaPlanning" };

type SP = { q?: string | string[]; tab?: string | string[] };

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ActualitesPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const query = first(searchParams.q).trim();
  const tab = first(searchParams.tab) === "alertes" ? "alertes" : "actu";

  // En recherche : un seul appel (résultats). Sinon : les 2 rubriques longues.
  const [news, alerts, results] = await Promise.all([
    query ? Promise.resolve([]) : getPharmacyNewsFull(),
    query ? Promise.resolve([]) : getMedicineAlertsFull(),
    query ? searchPharmacyNews(query, 30) : Promise.resolve([]),
  ]);

  return (
    <ActualitesView
      query={query}
      results={results}
      news={news}
      alerts={alerts}
      initialTab={tab}
    />
  );
}
