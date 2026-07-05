"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { isAdminLevel } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { updatePharmacyInput, type UpdatePharmacyInput } from "@/validators/pharmacy";
import { DASHBOARD_CACHE_TAGS } from "@/lib/dashboard-data";
import { canEditPayroll, isSuperAdmin } from "@/lib/payroll-permissions";
import { uploadImageIfDataUrl } from "@/lib/storage";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Mise à jour des paramètres de la pharmacie de l'admin connecté. */
export async function updatePharmacy(input: UpdatePharmacyInput): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (!isAdminLevel(session.user.role)) return { ok: false, error: "Accès admin requis" };

  const parsed = updatePharmacyInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  // SIRET : modification réservée au super-admin (compte créateur de
  // l'officine, sans fiche Employee liée). Les autres admins voient le
  // champ en lecture seule côté UI ; mais on double-check côté serveur
  // au cas où un appel API contournerait la front.
  const isSuper = isSuperAdmin({
    role: session.user.role,
    employeeId: session.user.employeeId ?? null,
  });
  let siretUpdate: { siret: string } | object = {};
  if (parsed.data.siret !== undefined) {
    if (!isSuper) {
      return {
        ok: false,
        error:
          "Seul le compte créateur de l'officine peut modifier le SIRET.",
      };
    }
    // Vérifie que le SIRET n'est pas déjà pris par une AUTRE pharmacie
    const conflict = await prisma.pharmacy.findFirst({
      where: {
        siret: parsed.data.siret,
        NOT: { id: session.user.pharmacyId },
      },
      select: { id: true },
    });
    if (conflict) {
      return {
        ok: false,
        error: "Ce SIRET est déjà utilisé par une autre officine.",
      };
    }
    siretUpdate = { siret: parsed.data.siret };
  }

  await prisma.pharmacy.update({
    where: { id: session.user.pharmacyId },
    data: {
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      minStaff: parsed.data.minStaff,
      ...siretUpdate,
    },
  });

  // Le nom apparaît dans la sidebar (cache 5 min) → invalide.
  revalidateTag(DASHBOARD_CACHE_TAGS.pharmacy(session.user.pharmacyId));
  revalidatePath("/parametres");
  // Le minStaff impacte la grille planning (couleurs effectif)
  revalidatePath("/planning");

  return { ok: true };
}

/* ─── Réglages Rémunération ──────────────────────────────────────────
   Région de référence pour le benchmark + taux de cotisations
   paramétrables. Réservé aux admins autorisés au module Rémunération
   (super-admin ou titulaire avec canAccessPayroll). Les taux sont stockés
   en FRACTION (0.22 = 22 %). Null = on retombe sur les défauts du moteur. */
const payrollSettingsInput = z.object({
  payrollRegion: z
    .enum(["NATIONAL", "IDF", "GRANDE_METROPOLE", "PROVINCE", "RURAL"])
    .nullable(),
  payrollContribEmployee: z.number().min(0).max(1).nullable(),
  payrollContribEmployer: z.number().min(0).max(1).nullable(),
});
export type PayrollSettingsInput = z.infer<typeof payrollSettingsInput>;

export async function updatePayrollSettings(
  input: PayrollSettingsInput
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };

  // Autorisation pleine (mêmes règles que la page Rémunération).
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      employeeId: true,
      canAccessPayroll: true,
      employee: { select: { status: true } },
    },
  });
  if (
    !me ||
    !canEditPayroll({
      role: me.role,
      employeeId: me.employeeId,
      canAccessPayroll: me.canAccessPayroll,
      employeeStatus: me.employee?.status ?? null,
    })
  ) {
    return { ok: false, error: "Accès au module Rémunération requis." };
  }

  const parsed = payrollSettingsInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
    };
  }

  await prisma.pharmacy.update({
    where: { id: session.user.pharmacyId },
    data: {
      payrollRegion: parsed.data.payrollRegion,
      payrollContribEmployee: parsed.data.payrollContribEmployee,
      payrollContribEmployer: parsed.data.payrollContribEmployer,
    },
  });

  revalidatePath("/parametres");
  revalidatePath("/remuneration");
  return { ok: true };
}

/* ─── Logo de l'officine ─────────────────────────────────────────────
   Upload sous forme de data URL base64 (encodage côté client). Limite
   à 200 KB pour ne pas alourdir la BDD. Type MIME restreint à PNG/JPEG/
   WebP/SVG (les formats raster + vectoriel courants pour un logo).
   Passer `null` retire le logo et restaure le fallback PharmaPlanning.
*/
const ALLOWED_LOGO_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const LOGO_MAX_BYTES = 200 * 1024;

export async function setPharmacyLogo(
  dataUrl: string | null
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (!isAdminLevel(session.user.role)) return { ok: false, error: "Accès admin requis" };

  if (dataUrl !== null) {
    // Format attendu : "data:<mime>;base64,<payload>"
    const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return { ok: false, error: "Format de fichier non reconnu." };
    }
    const mime = match[1].toLowerCase();
    if (!ALLOWED_LOGO_MIMES.has(mime)) {
      return {
        ok: false,
        error: "Format non supporté. Utilisez PNG, JPG, WebP ou SVG.",
      };
    }
    // Estimation de la taille décodée : 3/4 du payload base64 (ratio fixe).
    const approxBytes = Math.ceil((match[2].length * 3) / 4);
    if (approxBytes > LOGO_MAX_BYTES) {
      return {
        ok: false,
        error: `Logo trop lourd (${Math.round(approxBytes / 1024)} KB). Maximum 200 KB.`,
      };
    }
  }

  // Data URL base64 → upload vers Storage, on stocke l'URL (plus de base64 en
  // BDD). Idempotent : une URL http déjà présente reste inchangée.
  const logoUrl = await uploadImageIfDataUrl(dataUrl, "logos");

  await prisma.pharmacy.update({
    where: { id: session.user.pharmacyId },
    data: { logoUrl },
  });

  revalidateTag(DASHBOARD_CACHE_TAGS.pharmacy(session.user.pharmacyId));
  revalidatePath("/parametres");

  return { ok: true };
}
