import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (YYYY-MM-DD)");

/**
 * Création d'une note de régul par un collaborateur (ou un admin).
 * `authorId` n'est pas dans le payload — toujours = session.user.id côté API.
 */
export const createPayrollNoteInput = z.object({
  date: isoDate,
  infos: z.string().trim().min(1, "Le texte est requis").max(500),
  motif: z.string().trim().max(500).optional().nullable(),
});
export type CreatePayrollNoteInput = z.infer<typeof createPayrollNoteInput>;

/**
 * Édition côté admin :
 *  - `markAccounted: true` → comptabilise (statut ACCOUNTED + accountedAt + accountedById = admin)
 *  - `markAccounted: false` → repasse à PENDING (annule la comptabilisation)
 *  - `accountingNote` → note libre admin ("OK déduit sur 12/24")
 *
 * On peut envoyer l'un ou l'autre, ou les deux ensemble.
 */
export const reviewPayrollNoteInput = z
  .object({
    markAccounted: z.boolean().optional(),
    accountingNote: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (d) => d.markAccounted !== undefined || d.accountingNote !== undefined,
    { message: "Aucune modification fournie" }
  );
export type ReviewPayrollNoteInput = z.infer<typeof reviewPayrollNoteInput>;
