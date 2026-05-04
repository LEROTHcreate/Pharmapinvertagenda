import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getMessagesUnreadCounts,
  getPendingAbsencesCount,
  getPendingSwapsCount,
  getPendingUsersCount,
  getPharmacyHeader,
} from "@/lib/dashboard-data";
import { canViewPayroll } from "@/lib/payroll-permissions";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { PageTransition } from "@/components/layout/PageTransition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";

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
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            canAccessPayroll: true,
            employee: { select: { status: true } },
          },
        })
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
        userName={session.user.name}
        userRole={session.user.role}
        pendingUsersCount={pendingUsersCount}
        pendingSwapsCount={pendingSwapsCount}
        pendingAbsencesCount={pendingAbsencesCount}
        unreadSwapMessages={messagesUnread.swap}
        unreadTextMessages={messagesUnread.text}
        canViewPayroll={canSeePayroll}
      />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {/* Fade-up subtil à chaque navigation entre routes */}
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
