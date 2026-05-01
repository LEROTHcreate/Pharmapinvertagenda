import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ParametresForm } from "@/components/parametres/ParametresForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres — PharmaPlanning" };

export default async function ParametresPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/planning");

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: session.user.pharmacyId },
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      siret: true,
      minStaff: true,
    },
  });
  if (!pharmacy) redirect("/planning");

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Paramètres
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Informations générales et règles d'affichage du planning
        </p>
      </header>

      <ParametresForm
        initial={{
          name: pharmacy.name,
          address: pharmacy.address ?? "",
          phone: pharmacy.phone ?? "",
          minStaff: pharmacy.minStaff,
        }}
        siret={pharmacy.siret}
      />
    </div>
  );
}
