import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AbsencesHub } from "@/components/absences/AbsencesHub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absences & disponibilités — PharmaPlanning" };

export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const initialTab =
    searchParams.tab === "disponibilites" ? "disponibilites" : "absences";

  return (
    <AbsencesHub
      currentUser={{
        role: session.user.role,
        employeeId: session.user.employeeId ?? null,
      }}
      initialTab={initialTab}
    />
  );
}
