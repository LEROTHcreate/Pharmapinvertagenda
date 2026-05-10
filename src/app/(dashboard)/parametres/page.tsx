import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ParametresForm } from "@/components/parametres/ParametresForm";
import { PharmacyLogoForm } from "@/components/parametres/PharmacyLogoForm";
import { isSuperAdmin } from "@/lib/payroll-permissions";

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
      logoUrl: true,
    },
  });
  if (!pharmacy) redirect("/planning");

  // Le SIRET n'est éditable que pour le super-admin (créateur de l'officine,
  // admin sans Employee lié). Le serveur revérifie cette autorisation.
  const canEditSiret = isSuperAdmin({
    role: session.user.role,
    employeeId: session.user.employeeId ?? null,
  });

  return (
    <div className="p-3 md:p-4 max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Paramètres
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Informations générales et règles d'affichage du planning
        </p>
      </header>

      <PharmacyLogoForm
        initialLogoUrl={pharmacy.logoUrl ?? null}
        pharmacyName={pharmacy.name}
      />

      <ParametresForm
        initial={{
          name: pharmacy.name,
          address: pharmacy.address ?? "",
          phone: pharmacy.phone ?? "",
          siret: pharmacy.siret ?? "",
          minStaff: pharmacy.minStaff,
        }}
        canEditSiret={canEditSiret}
      />
    </div>
  );
}
