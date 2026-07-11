"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminLevel } from "@/lib/permissions";

/**
 * Actions serveur — solde de congés payés. Réservées au TITULAIRE (isAdminLevel :
 * ADMIN/CREATEUR) : les CP sont une donnée sensible, non visible des autres rôles.
 */

type Result = { ok: true } | { ok: false; error: string };

const cpBaseInput = z.object({
  employeeId: z.string().min(1),
  /** Solde de référence en jours (0–200). */
  balance: z.number().min(0).max(200),
  /** Date à laquelle ce solde était exact (ISO YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
});

/** Enregistre le solde CP de référence d'un collaborateur (titulaire only). */
export async function setCpBase(raw: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié." };
  if (!isAdminLevel(session.user.role)) {
    return { ok: false, error: "Réservé au titulaire." };
  }

  const parsed = cpBaseInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides.",
    };
  }
  const { employeeId, balance, date } = parsed.data;

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, pharmacyId: session.user.pharmacyId },
    select: { id: true },
  });
  if (!emp) return { ok: false, error: "Collaborateur introuvable." };

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      cpBalanceBase: balance,
      cpBalanceBaseDate: new Date(`${date}T00:00:00.000Z`),
    },
  });

  revalidatePath("/absences");
  return { ok: true };
}
