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

/**
 * Absence COLLECTIVE (admin only) — ex. fermeture de l'officine un jour férié /
 * pont : marque toute l'équipe (ou une liste de collaborateurs) absente sur une
 * plage, en une seule action. Crée une demande APPROVED par collaborateur et
 * convertit leurs créneaux planning existants en ABSENCE.
 *
 * - `employeeIds` omis → toute l'équipe ACTIVE de la pharmacie.
 * - plage bornée à 92 jours pour éviter une conversion massive accidentelle.
 */
export const createCollectiveAbsenceInput = z
  .object({
    dateStart: isoDate,
    dateEnd: isoDate,
    absenceCode: z.enum(ABSENCE_CODES),
    reason: z.string().trim().max(500).optional(),
    employeeIds: z.array(z.string().cuid()).min(1).optional(),
  })
  .refine((d) => d.dateStart <= d.dateEnd, {
    message: "La date de début doit être ≤ date de fin",
    path: ["dateEnd"],
  })
  .refine(
    (d) => {
      const start = new Date(`${d.dateStart}T00:00:00Z`).getTime();
      const end = new Date(`${d.dateEnd}T00:00:00Z`).getTime();
      const days = (end - start) / 86_400_000 + 1;
      return days <= 92;
    },
    { message: "La plage ne peut pas dépasser 92 jours", path: ["dateEnd"] }
  );
export type CreateCollectiveAbsenceInput = z.infer<
  typeof createCollectiveAbsenceInput
>;

/** Validation/refus côté admin. */
export const reviewAbsenceInput = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  adminNote: z.string().trim().max(500).optional(),
});
export type ReviewAbsenceInput = z.infer<typeof reviewAbsenceInput>;
