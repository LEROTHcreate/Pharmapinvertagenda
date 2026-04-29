import { z } from "zod";

export const ABSENCE_CODES = [
  "ABSENT",
  "CONGE",
  "MALADIE",
  "FORMATION_ABS",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (YYYY-MM-DD)");

/** Création d'une demande d'absence par un collaborateur. */
export const createAbsenceInput = z
  .object({
    dateStart: isoDate,
    dateEnd: isoDate,
    absenceCode: z.enum(ABSENCE_CODES),
    reason: z.string().trim().max(500).optional(),
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
