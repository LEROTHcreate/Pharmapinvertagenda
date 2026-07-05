import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getMessagesUnreadCounts,
  getPayrollUserContext,
  getPendingAbsencesCount,
  getPendingSwapsCount,
  getPendingUsersCount,
  getPharmacyHeader,
} from "@/lib/dashboard-data";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { isAdminLevel } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { PageTransition } from "@/components/layout/PageTransition";

/**
 * Surcharge dynamique du favicon : sur les pages connectées, on affiche le
 * logo de l'officine de l'utilisateur dans l'onglet du navigateur (et le
 * nom de la pharmacie dans le titre par défaut). Les pages publiques
 * (landing, login, signup) gardent le favicon de marque PharmaPlanning
 * défini dans le layout racine.
 *
 * Si la pharmacie n'a pas de logo custom, on n'override pas → on hérite
 * du favicon PharmaPlanning du layout racine, plutôt que d'afficher un
 * favicon cassé.
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  if (!session?.user) return {};
  const pharmacy = await getPharmacyHeader(session.user.pharmacyId);
  if (!pharmacy) return {};

  const meta: Metadata = {
    // Nom de l'officine dans l'onglet (différencie l'app connectée de la
    // vitrine publique "PharmaPlanning"). Le template s'applique aux
    // sous-pages qui définissent leur propre titre (ex: "Absences · Pharmacie X").
    title: {
      default: pharmacy.name,
      template: `%s · ${pharmacy.name}`,
    },
  };

  // Favicon personnalisé uniquement si l'officine a un logo custom ; sinon
  // on hérite du favicon de marque PharmaPlanning (pas de croix cassée).
  // PERF : logoUrl peut être un data URL base64 (~200 Ko). On ne l'émet QU'UNE
  // fois (`icon`) et pas en triple (icon + shortcut + apple) — sinon ~600 Ko de
  // base64 sont inline dans le <head> de CHAQUE page du dashboard, alourdissant
  // le HTML et le premier rendu. L'icône PWA/home-screen vient du manifest.
  if (pharmacy.logoUrl) {
    meta.icons = { icon: pharmacy.logoUrl };
  }
  return meta;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = isAdminLevel(session.user.role);

  const [
    pharmacy,
    pendingUsersCount,
    pendingSwapsCount,
    pendingAbsencesCount,
    messagesUnread,
    payrollUserCtx,
  ] = await Promise.all([
    getPharmacyHeader(session.user.pharmacyId),
    isAdmin
      ? getPendingUsersCount(session.user.pharmacyId)
      : Promise.resolve(0),
    isAdmin
      ? getPendingSwapsCount(session.user.pharmacyId)
      : Promise.resolve(0),
    isAdmin
      ? getPendingAbsencesCount(session.user.pharmacyId)
      : Promise.resolve(0),
    getMessagesUnreadCounts(session.user.id),
    // Récupère le flag canAccessPayroll + status Employee pour décider
    // si l'item Rémunération doit apparaître dans la sidebar.
    isAdmin
      ? getPayrollUserContext(session.user.id)
      : Promise.resolve(null),
  ]);

  const canSeePayroll = isAdmin
    ? canViewPayroll({
        role: session.user.role,
        employeeId: session.user.employeeId,
        canAccessPayroll: payrollUserCtx?.canAccessPayroll ?? false,
        employeeStatus: payrollUserCtx?.employee?.status ?? null,
      })
    : false;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-muted/30 relative">
      {/* Mesh gradient lent en arrière-plan — donne de la profondeur sans
          déranger la lecture (contain: paint pour isoler le compositing). */}
      <div className="mesh-bg" aria-hidden>
        <span />
      </div>
      <Sidebar
        pharmacyName={pharmacy?.name ?? "Pharmacie"}
        pharmacyLogoUrl={pharmacy?.logoUrl ?? null}
        userName={session.user.name}
        userRole={session.user.role}
        pendingUsersCount={pendingUsersCount}
        pendingSwapsCount={pendingSwapsCount}
        pendingAbsencesCount={pendingAbsencesCount}
        unreadSwapMessages={messagesUnread.swap}
        unreadTextMessages={messagesUnread.text}
        canViewPayroll={canSeePayroll}
      />
      <MobileNav
        pharmacyName={pharmacy?.name ?? "Pharmacie"}
        pharmacyLogoUrl={pharmacy?.logoUrl ?? null}
        userName={session.user.name}
        userRole={session.user.role}
        pendingUsersCount={pendingUsersCount}
        pendingSwapsCount={pendingSwapsCount}
        pendingAbsencesCount={pendingAbsencesCount}
        unreadSwapMessages={messagesUnread.swap}
        unreadTextMessages={messagesUnread.text}
        canViewPayroll={canSeePayroll}
      />
      <main
        className={cn(
          "flex-1 min-w-0 overflow-x-hidden",
          // Espace en bas sur mobile pour que le contenu ne passe pas sous
          // la tab bar fixe (~56px) + safe-area iOS. Desktop : pas besoin.
          "pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-0"
        )}
      >
        {/* Fade-up subtil à chaque navigation entre routes */}
        <PageTransition>{children}</PageTransition>
      </main>

      {/* Tab bar mobile — fixée en bas, pouce-friendly. Visible uniquement
          sur mobile (md:hidden interne). Les pages secondaires admin
          (Gabarits, Stats, Rémunération, Utilisateurs, Paramètres) restent
          accessibles via le burger MobileNav en haut à gauche. */}
      <MobileTabBar
        userRole={session.user.role}
        pendingAbsencesCount={pendingAbsencesCount}
        pendingSwapsCount={pendingSwapsCount}
        unreadSwapMessages={messagesUnread.swap}
        unreadTextMessages={messagesUnread.text}
      />
    </div>
  );
}
