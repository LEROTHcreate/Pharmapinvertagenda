import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AbsencesView } from "@/components/absences/AbsencesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absences — PharmaPlanning" };

export default async function AbsencesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AbsencesView
      currentUser={{
        role: session.user.role,
        employeeId: session.user.employeeId ?? null,
      }}
    />
  );
}
