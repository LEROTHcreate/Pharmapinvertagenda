import { z } from "zod";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Création d'une demande d'échange dans une conversation */
export const createSwapInput = z
  .object({
    conversationId: z.string().min(1),
    targetId: z.string().min(1),         // userId du collègue sollicité
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (YYYY-MM-DD)"),
    fullDay: z.boolean().default(false),
    startTime: z.string().regex(TIME_RE).nullable().optional(),
    endTime: z.string().regex(TIME_RE).nullable().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.fullDay) {
      if (!val.startTime || !val.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startTime et endTime requis si fullDay=false",
        });
        return;
      }
      if (val.startTime >= val.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startTime doit être < endTime",
        });
      }
    }
  });
export type CreateSwapInput = z.infer<typeof createSwapInput>;

/** Validation/refus côté admin */
export const reviewSwapInput = z.object({
  approve: z.boolean(),
  rejectionNote: z.string().trim().max(500).optional(),
});
export type ReviewSwapInput = z.infer<typeof reviewSwapInput>;

/** Refus côté cible (le collègue ne peut/veut pas couvrir) */
export const rejectSwapInput = z.object({
  rejectionNote: z.string().trim().max(500).optional(),
});
export type RejectSwapInput = z.infer<typeof rejectSwapInput>;
