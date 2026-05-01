import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notification d'événement — payload uniforme côté client.
 * Le `kind` permet au front de choisir l'icône, le ton et le lien.
 */
export type NotificationItem = {
  id: string;
  kind:
    | "absence-pending"   // demande d'absence en attente (admin)
    | "absence-decided"   // ma demande d'absence a été validée/refusée (employé)
    | "swap-pending"      // demande d'échange en attente (admin)
    | "user-pending";     // inscription en attente (admin)
  title: string;
  description: string;
  href: string;
  createdAt: string; // ISO
  unread: boolean;
};

/**
 * GET /api/notifications — liste des 20 événements récents pertinents pour
 * l'utilisateur connecté.
 *
 * - ADMIN : voit les demandes d'absence en attente, les échanges en attente
 *   de validation admin, et les inscriptions PENDING
 * - EMPLOYEE : voit ses propres demandes d'absence quand l'admin a tranché
 *   (validée / refusée)
 *
 * Critère "unread" : événement non vu par l'utilisateur. On stocke
 * un timestamp `lastNotifSeenAt` côté client (localStorage). Côté API on
 * retourne l'événement avec sa date — au front de comparer.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const pharmacyId = session.user.pharmacyId;

  if (isAdmin) {
    const [pendingAbsences, pendingSwaps, pendingUsers] = await Promise.all([
      prisma.absenceRequest.findMany({
        where: { pharmacyId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          dateStart: true,
          dateEnd: true,
          absenceCode: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.shiftSwapRequest.findMany({
        where: { pharmacyId, status: "PENDING_ADMIN" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          date: true,
          requester: { select: { name: true } },
          target: { select: { name: true } },
        },
      }),
      prisma.user.findMany({
        where: { pharmacyId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, createdAt: true, name: true, email: true },
      }),
    ]);

    const items: NotificationItem[] = [];

    for (const a of pendingAbsences) {
      const empName = `${a.employee.firstName}${
        a.employee.lastName !== "—" ? " " + a.employee.lastName : ""
      }`;
      const sameDay =
        a.dateStart.toISOString().slice(0, 10) ===
        a.dateEnd.toISOString().slice(0, 10);
      const period = sameDay
        ? a.dateStart.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
          })
        : `${a.dateStart.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
          })} → ${a.dateEnd.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
          })}`;
      items.push({
        id: `abs-${a.id}`,
        kind: "absence-pending",
        title: `${empName} demande un congé`,
        description: `${a.absenceCode} · ${period}`,
        href: "/absences",
        createdAt: a.createdAt.toISOString(),
        unread: true,
      });
    }

    for (const s of pendingSwaps) {
      const requesterName = s.requester?.name ?? "Quelqu'un";
      const targetName = s.target?.name ?? "?";
      items.push({
        id: `swap-${s.id}`,
        kind: "swap-pending",
        title: `Échange à valider : ${requesterName} ↔ ${targetName}`,
        description: `Le ${s.date.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
        })}`,
        href: "/messages",
        createdAt: s.createdAt.toISOString(),
        unread: true,
      });
    }

    for (const u of pendingUsers) {
      items.push({
        id: `user-${u.id}`,
        kind: "user-pending",
        title: `${u.name} demande l'accès`,
        description: u.email,
        href: "/utilisateurs",
        createdAt: u.createdAt.toISOString(),
        unread: true,
      });
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ items: items.slice(0, 20) });
  }

  // Employé : ses propres demandes d'absence quand l'admin a tranché récemment
  if (!session.user.employeeId) {
    return NextResponse.json({ items: [] });
  }

  const decidedAbsences = await prisma.absenceRequest.findMany({
    where: {
      employeeId: session.user.employeeId,
      status: { in: ["APPROVED", "REJECTED"] },
      reviewedAt: { not: null },
    },
    orderBy: { reviewedAt: "desc" },
    take: 10,
    select: {
      id: true,
      reviewedAt: true,
      dateStart: true,
      dateEnd: true,
      status: true,
      absenceCode: true,
      adminNote: true,
    },
  });

  const items: NotificationItem[] = decidedAbsences.map((a) => ({
    id: `abs-decided-${a.id}`,
    kind: "absence-decided",
    title:
      a.status === "APPROVED"
        ? `Votre congé a été validé`
        : `Votre congé a été refusé`,
    description: `${a.absenceCode} · ${a.dateStart.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    })}${
      a.adminNote ? ` — « ${a.adminNote} »` : ""
    }`,
    href: "/absences",
    createdAt: (a.reviewedAt ?? new Date()).toISOString(),
    unread: true,
  }));

  return NextResponse.json({ items });
}
