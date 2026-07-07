import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPharmacyNewsFull, getMedicineAlertsFull } from "@/lib/pharmacy-news";
import { ActualitesView } from "@/components/actualites/ActualitesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Actualités pharmacie — PharmaPlanning" };

type SP = { tab?: string | string[] };

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

  const tab = first(searchParams.tab) === "alertes" ? "alertes" : "actu";

  // On charge les deux rubriques (cache 1 h) ; le filtre se fait en direct
  // côté client au fil de la frappe.
  const [news, alerts] = await Promise.all([
    getPharmacyNewsFull(),
    getMedicineAlertsFull(),
  ]);

  return <ActualitesView news={news} alerts={alerts} initialTab={tab} />;
}
