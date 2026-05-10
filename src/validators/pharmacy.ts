import { z } from "zod";

/**
 * SIRET français normalisé : 14 chiffres, espaces optionnels en saisie
 * (les officines l'écrivent souvent groupé, ex. "798 898 599 00013").
 */
const siretSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .refine((v) => /^\d{14}$/.test(v), {
    message: "Le SIRET doit contenir 14 chiffres",
  });

/**
 * Mise à jour des paramètres généraux de la pharmacie.
 *
 * Le champ `siret` est optionnel et n'est accepté côté API QUE si l'utilisateur
 * est super-admin (admin sans Employee lié = compte créateur). Les autres
 * admins ne peuvent pas le modifier — c'est l'identifiant administratif clé
 * pour les inscriptions des collaborateurs.
 */
export const updatePharmacyInput = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  siret: siretSchema.optional(),
  minStaff: z.number().int().min(0).max(50),
});
export type UpdatePharmacyInput = z.infer<typeof updatePharmacyInput>;
