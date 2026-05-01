"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updatePharmacyInput, type UpdatePharmacyInput } from "@/validators/pharmacy";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Mise à jour des paramètres de la pharmacie de l'admin connecté. */
export async function updatePharmacy(input: UpdatePharmacyInput): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (session.user.role !== "ADMIN") return { ok: false, error: "Accès admin requis" };

  const parsed = updatePharmacyInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  await prisma.pharmacy.update({
    where: { id: session.user.pharmacyId },
    data: {
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      minStaff: parsed.data.minStaff,
    },
  });

  // Le nom apparaît dans la sidebar (cache 5 min) → invalide.
  revalidateTag(DASHBOARD_CACHE_TAGS.pharmacy(session.user.pharmacyId));
  revalidatePath("/parametres");
  // Le minStaff impacte la grille planning (couleurs effectif)
  revalidatePath("/planning");

  return { ok: true };
}
