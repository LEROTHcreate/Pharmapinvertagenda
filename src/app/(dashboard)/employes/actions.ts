"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { employeeInput, type EmployeeInput } from "@/validators/employee";
import { computeInsertionOrder } from "@/lib/display-order";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Place un collaborateur à la position `targetOrder` dans l'ordre d'affichage,
 * en DÉCALANT les autres (insertion, pas remplacement) puis en renumérotant la
 * liste de façon contiguë (0..N). Ex : poser quelqu'un en 6 → l'ancien 6
 * devient 7, le 7 devient 8, etc. On ne réécrit que les lignes dont l'ordre
 * change réellement.
 */
async function placeAtOrder(
  tx: Prisma.TransactionClient,
  pharmacyId: string,
  movedId: string,
  targetOrder: number
): Promise<void> {
  const all = await tx.employee.findMany({
    where: { pharmacyId },
    select: { id: true, displayOrder: true, lastName: true },
    orderBy: [{ displayOrder: "asc" }, { lastName: "asc" }],
  });
  const current = new Map(all.map((e) => [e.id, e.displayOrder]));
  const ordered = computeInsertionOrder(
    all.map((e) => e.id),
    movedId,
    targetOrder
  );
  for (let idx = 0; idx < ordered.length; idx++) {
    if (current.get(ordered[idx]) !== idx) {
      await tx.employee.update({
        where: { id: ordered[idx] },
        data: { displayOrder: idx },
      });
    }
  }
}

/** Champs RH communs à create/update (conversion date string → Date|null). */
function hrFields(data: EmployeeInput) {
  const toDate = (s?: string | null) => (s ? new Date(s) : null);
  return {
    contractType: data.contractType,
    contractEndDate: toDate(data.contractEndDate),
    trialEndDate: toDate(data.trialEndDate),
    departureDate: toDate(data.departureDate),
    lastMedicalVisitDate: toDate(data.lastMedicalVisitDate),
    lastProfessionalInterviewDate: toDate(data.lastProfessionalInterviewDate),
    dpcLastDate: toDate(data.dpcLastDate),
  };
}

type AdminCtx =
  | { ok: false; error: string }
  | { ok: true; pharmacyId: string };

async function requireAdmin(): Promise<AdminCtx> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  // Gestion des fiches collaborateurs = TITULAIRES uniquement (manageurs et
  // collaborateurs sont en lecture seule sur la page Équipe).
  if (!isAdminLevel(session.user.role))
    return { ok: false, error: "Réservé aux titulaires" };
  return { ok: true, pharmacyId: session.user.pharmacyId };
}

export async function createEmployee(raw: unknown): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const parsed = employeeInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const data = parsed.data;
  // Création + insertion à la position voulue (décale les autres), en une
  // transaction pour rester cohérent.
  await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        pharmacyId: ctx.pharmacyId,
        firstName: data.firstName,
        lastName: data.lastName,
        status: data.status,
        weeklyHours: data.weeklyHours,
        overtimeReference: data.overtimeReference,
        displayColor: data.displayColor,
        isActive: data.isActive,
        hireDate: data.hireDate ? new Date(data.hireDate) : null,
        ...hrFields(data),
      },
      select: { id: true },
    });
    await placeAtOrder(tx, ctx.pharmacyId, created.id, data.displayOrder);
  });

  revalidatePath("/employes");
  revalidatePath("/planning");
  return { ok: true };
}

export async function updateEmployee(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const parsed = employeeInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const existing = await prisma.employee.findFirst({
    where: { id, pharmacyId: ctx.pharmacyId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Collaborateur introuvable" };

  const data = parsed.data;
  // Mise à jour des champs + repositionnement (insertion qui décale les
  // autres) en une transaction.
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        status: data.status,
        weeklyHours: data.weeklyHours,
        overtimeReference: data.overtimeReference,
        displayColor: data.displayColor,
        isActive: data.isActive,
        hireDate: data.hireDate ? new Date(data.hireDate) : null,
        ...hrFields(data),
      },
    });
    await placeAtOrder(tx, ctx.pharmacyId, id, data.displayOrder);
  });

  revalidatePath("/employes");
  revalidatePath("/planning");
  return { ok: true };
}

export async function toggleEmployeeActive(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const result = await prisma.employee.updateMany({
    where: { id, pharmacyId: ctx.pharmacyId },
    data: { isActive },
  });
  if (result.count === 0) return { ok: false, error: "Collaborateur introuvable" };

  revalidatePath("/employes");
  revalidatePath("/planning");
  return { ok: true };
}

export async function deleteEmployee(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const result = await prisma.employee.deleteMany({
    where: { id, pharmacyId: ctx.pharmacyId },
  });
  if (result.count === 0) return { ok: false, error: "Collaborateur introuvable" };

  revalidatePath("/employes");
  revalidatePath("/planning");
  return { ok: true };
}
