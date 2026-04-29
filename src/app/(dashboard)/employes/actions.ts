"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { employeeInput } from "@/validators/employee";

type ActionResult = { ok: true } | { ok: false; error: string };

type AdminCtx =
  | { ok: false; error: string }
  | { ok: true; pharmacyId: string };

async function requireAdmin(): Promise<AdminCtx> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (session.user.role !== "ADMIN")
    return { ok: false, error: "Réservé aux administrateurs" };
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
  await prisma.employee.create({
    data: {
      pharmacyId: ctx.pharmacyId,
      firstName: data.firstName,
      lastName: data.lastName,
      status: data.status,
      weeklyHours: data.weeklyHours,
      displayColor: data.displayColor,
      displayOrder: data.displayOrder,
      isActive: data.isActive,
      hireDate: data.hireDate ? new Date(data.hireDate) : null,
    },
  });

  revalidatePath("/employes");
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
  await prisma.employee.update({
    where: { id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      status: data.status,
      weeklyHours: data.weeklyHours,
      displayColor: data.displayColor,
      displayOrder: data.displayOrder,
      isActive: data.isActive,
      hireDate: data.hireDate ? new Date(data.hireDate) : null,
    },
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
