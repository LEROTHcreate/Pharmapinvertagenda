import { z } from "zod";

/** Mise à jour des paramètres généraux de la pharmacie. */
export const updatePharmacyInput = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  minStaff: z.number().int().min(0).max(50),
});
export type UpdatePharmacyInput = z.infer<typeof updatePharmacyInput>;
