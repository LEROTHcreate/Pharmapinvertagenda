import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { updateUserSchema } from "@/validators/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/[id]
 *
 * Met à jour la liaison User ↔ Employee d'un compte APPROUVÉ. Sert au cas où
 * l'admin a approuvé sans lier le compte à une fiche planning, ou veut corriger
 * une mauvaise liaison plus tard.
 *
 * Body: { employeeId: string | null }
 *   - string → relie au collaborateur (qui doit être de la même pharmacie et libre)
 *   - null   → retire la liaison existante (le compte reste actif)
 *
 * Garde-fous :
 *  - Admin uniquement, même pharmacie
 *  - Compte cible doit être APPROVED (les PENDING passent par /review)
 *  - Le collaborateur cible ne doit pas être déjà lié à un autre compte
 */
async function PATCH__impl(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const parsed = updateUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const { employeeId } = parsed.data;

  const target = await prisma.user.findFirst({
    where: { id: params.id, pharmacyId: session.user.pharmacyId },
    select: { id: true, status: true },
  });
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (target.status !== "APPROVED") {
    // Pour un PENDING, le bon endpoint est /review (qui set le rôle + lien en
    // une transaction). On refuse ici pour éviter de splitter la logique.
    return NextResponse.json({ error: "NOT_APPROVED" }, { status: 409 });
  }

  if (employeeId !== null) {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, pharmacyId: session.user.pharmacyId },
      select: { id: true, user: { select: { id: true } } },
    });
    if (!employee) {
      return NextResponse.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
    }
    if (employee.user && employee.user.id !== target.id) {
      return NextResponse.json({ error: "EMPLOYEE_TAKEN" }, { status: 409 });
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { employeeId },
  });

  return NextResponse.json({ ok: true });
}

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
async function DELETE__impl(
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

export const PATCH = withErrorHandling(PATCH__impl);
export const DELETE = withErrorHandling(DELETE__impl);
