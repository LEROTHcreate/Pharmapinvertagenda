import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AvailabilityWishesView } from "@/components/disponibilites/AvailabilityWishesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disponibilités — PharmaPlanning" };

export default async function DisponibilitesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Disponibilités</h1>
        <p className="text-sm text-muted-foreground">
          Indiquez vos indisponibilités et préférences — l&apos;administrateur en
          tient compte au moment de bâtir le planning.
        </p>
      </header>

      <AvailabilityWishesView
        isAdmin={session.user.role === "ADMIN"}
        hasEmployee={!!session.user.employeeId}
      />
    </div>
  );
}
