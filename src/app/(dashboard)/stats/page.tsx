import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { computeStats, type StatsPeriod } from "@/lib/stats";
import { StatsView } from "@/components/stats/StatsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statistiques — PharmaPlanning" };

const VALID_PERIODS: StatsPeriod[] = ["week", "month", "semester", "all"];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/planning");

  const requested = searchParams.period as StatsPeriod | undefined;
  const period: StatsPeriod = VALID_PERIODS.includes(requested ?? "semester" as StatsPeriod)
    ? (requested as StatsPeriod) ?? "semester"
    : "semester";

  const { employees, periodLabel } = await computeStats(
    session.user.pharmacyId,
    period
  );

  return (
    <StatsView
      period={period}
      periodLabel={periodLabel}
      employees={employees}
    />
  );
}
