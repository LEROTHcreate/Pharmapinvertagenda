import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ParametresForm } from "@/components/parametres/ParametresForm";
import { PharmacyLogoForm } from "@/components/parametres/PharmacyLogoForm";
import { PayrollSettingsForm } from "@/components/parametres/PayrollSettingsForm";
import { canEditPayroll, isSuperAdmin } from "@/lib/payroll-permissions";
import { canEditSettings } from "@/lib/permissions";
import { REGION_LABELS, type Region } from "@/lib/payroll-reference";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres — PharmaPlanning" };

export default async function ParametresPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Décision produit (cf. CLAUDE.md) : page visible par TOUS en lecture ;
  // modification réservée aux titulaires+ (canEditSettings). Le bloc
  // Rémunération reste masqué aux non-autorisés (canSeePayrollSettings).
  // Le serveur revérifie chaque écriture (actions gatées).
  const canEdit = canEditSettings(session.user.role);

  const [pharmacy, me] = await Promise.all([
    prisma.pharmacy.findUnique({
      where: { id: session.user.pharmacyId },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        siret: true,
        minStaff: true,
        logoUrl: true,
        payrollRegion: true,
        payrollContribEmployee: true,
        payrollContribEmployer: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
        employeeId: true,
        canAccessPayroll: true,
        employee: { select: { status: true } },
      },
    }),
  ]);
  if (!pharmacy) redirect("/planning");

  // Le SIRET n'est éditable que pour le super-admin (créateur de l'officine,
  // admin sans Employee lié). Le serveur revérifie cette autorisation.
  const canEditSiret = isSuperAdmin({
    role: session.user.role,
    employeeId: session.user.employeeId ?? null,
  });

  // Réglages Rémunération : visibles uniquement pour les admins autorisés.
  const canSeePayrollSettings = me
    ? canEditPayroll({
        role: me.role,
        employeeId: me.employeeId,
        canAccessPayroll: me.canAccessPayroll,
        employeeStatus: me.employee?.status ?? null,
      })
    : false;

  const payrollRegion: Region =
    pharmacy.payrollRegion && pharmacy.payrollRegion in REGION_LABELS
      ? (pharmacy.payrollRegion as Region)
      : "NATIONAL";

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

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Lecture seule — seul un titulaire peut modifier les paramètres de
            l&apos;officine.
          </p>
        </div>
      )}

      <PharmacyLogoForm
        initialLogoUrl={pharmacy.logoUrl ?? null}
        pharmacyName={pharmacy.name}
        canEdit={canEdit}
      />

      <ParametresForm
        initial={{
          name: pharmacy.name,
          address: pharmacy.address ?? "",
          phone: pharmacy.phone ?? "",
          siret: pharmacy.siret ?? "",
          minStaff: pharmacy.minStaff,
        }}
        canEdit={canEdit}
        canEditSiret={canEditSiret}
      />

      {canSeePayrollSettings && (
        <PayrollSettingsForm
          initial={{
            region: payrollRegion,
            contribEmployeePct:
              pharmacy.payrollContribEmployee != null
                ? Math.round(pharmacy.payrollContribEmployee * 1000) / 10
                : null,
            contribEmployerPct:
              pharmacy.payrollContribEmployer != null
                ? Math.round(pharmacy.payrollContribEmployer * 1000) / 10
                : null,
          }}
        />
      )}
    </div>
  );
}
