import { z } from "zod";

export const ABSENCE_CODES = [
  "ABSENT",
  "CONGE",
  "MALADIE",
  "FORMATION_ABS",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (YYYY-MM-DD)");

/**
 * Création d'une demande d'absence.
 *
 * - Mode collaborateur : ne renseigne ni `targetEmployeeId` ni `autoApprove`.
 *   La demande est créée pour son propre compte avec statut PENDING.
 *
 * - Mode admin (saisie manuelle depuis la toolbar Absences) :
 *   - `targetEmployeeId` (optionnel) : crée la demande pour ce collaborateur.
 *   - `autoApprove: true` (admin only) : crée la demande directement APPROVED
 *     ET convertit les ScheduleEntry existants de la plage en ABSENCE — même
 *     effet qu'une approbation manuelle, sans passer par PENDING.
 */
export const createAbsenceInput = z
  .object({
    dateStart: isoDate,
    dateEnd: isoDate,
    absenceCode: z.enum(ABSENCE_CODES),
    reason: z.string().trim().max(500).optional(),
    targetEmployeeId: z.string().cuid().optional(),
    autoApprove: z.boolean().optional(),
  })
  .refine((d) => d.dateStart <= d.dateEnd, {
    message: "La date de début doit être ≤ date de fin",
    path: ["dateEnd"],
  });
export type CreateAbsenceInput = z.infer<typeof createAbsenceInput>;

/** Validation/refus côté admin. */
export const reviewAbsenceInput = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  adminNote: z.string().trim().max(500).optional(),
});
export type ReviewAbsenceInput = z.infer<typeof reviewAbsenceInput>;
