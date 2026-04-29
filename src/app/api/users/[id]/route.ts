import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/users/[id]
 * Supprime définitivement un compte utilisateur (et libère sa liaison
 * Employee — la fiche métier reste, le collaborateur pourra se réinscrire et être
 * relié à nouveau).
 *
 * Garde-fous :
 *  - Admin uniquement
 *  - Même pharmacie
 *  - Pas de self-delete (un admin ne peut pas se supprimer)
 *  - Pas de suppression du dernier admin actif (anti-lockout)
 *
 * Effets de cascade (via le schéma Prisma) :
 *  - Messages, conversations créées, échanges demandés/reçus → supprimés
 *  - Échanges validés par cet admin → conservés (champ reviewer mis à null)
 *  - Fiche Employee → conservée (juste délinkée)
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (params.id === session.user.id) {
    return NextResponse.json({ error: "CANNOT_DELETE_SELF" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true, role: true, status: true },
  });
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Anti-lockout : on refuse la suppression si elle laisserait la pharmacie
  // sans aucun admin actif (= dernier admin approuvé/actif de la pharmacie).
  if (target.role === "ADMIN" && target.status === "APPROVED") {
    const otherAdminsCount = await prisma.user.count({
      where: {
        pharmacyId: session.user.pharmacyId,
        role: "ADMIN",
        status: "APPROVED",
        isActive: true,
        id: { not: target.id },
      },
    });
    if (otherAdminsCount === 0) {
      return NextResponse.json({ error: "LAST_ADMIN" }, { status: 409 });
    }
  }

  await prisma.user.delete({ where: { id: target.id } });
  // Le compteur "demandes en attente" peut bouger si on a supprimé un PENDING
  revalidateTag(DASHBOARD_CACHE_TAGS.usersPending(session.user.pharmacyId));

  return NextResponse.json({ ok: true });
}
