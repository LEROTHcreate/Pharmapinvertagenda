import { z } from "zod";
import { TASK_CODES, ABSENCE_CODES } from "./planning";

const timeSlot = z.string().regex(/^\d{2}:\d{2}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const templateEntryInput = z
  .object({
    employeeId: z.string().min(1),
    dayOfWeek: z.number().int().min(0).max(5), // 0=Lun, 5=Sam
    timeSlot,
    type: z.enum(["TASK", "ABSENCE"]),
    taskCode: z.enum(TASK_CODES).nullish(),
    absenceCode: z.enum(ABSENCE_CODES).nullish(),
  })
  .refine(
    (v) =>
      (v.type === "TASK" && !!v.taskCode && !v.absenceCode) ||
      (v.type === "ABSENCE" && !!v.absenceCode && !v.taskCode),
    { message: "type/taskCode/absenceCode incohérents" }
  );

export const weekTypeEnum = z.enum(["S1", "S2"]);

export const upsertTemplateInput = z.object({
  /** Si présent : update du gabarit existant. Sinon : nouveau gabarit. */
  id: z.string().min(1).optional(),
  weekType: weekTypeEnum,
  name: z.string().trim().min(1, "Nom requis").max(80),
  entries: z.array(templateEntryInput).max(2000),
});

export const applyTemplateInput = z.object({
  weekStart: isoDate,
  overwrite: z.boolean().default(false),
});

/**
 * Application combinée S1 + S2 sur plusieurs semaines.
 *
 * - `s1TemplateId` : si défini, sera appliqué sur chaque semaine S1 (impaire)
 *   parmi les semaines ciblées
 * - `s2TemplateId` : idem pour les semaines S2 (paires)
 * - `weeks` : nombre d'occurrences à appliquer
 *     - Si un seul des deux IDs est défini → N semaines de ce type
 *       (ex : N=4 + S1 seul = 4 semaines S1 = 8 semaines calendaires)
 *     - Si les deux IDs sont définis → N semaines calendaires consécutives
 *       (alternance automatique S1/S2 selon la parité ISO)
 * - `overwrite` : remplace les créneaux existants si true (sinon les modifs
 *   manuelles sont préservées)
 */
export const applyBatchInput = z
  .object({
    s1TemplateId: z.string().min(1).optional(),
    s2TemplateId: z.string().min(1).optional(),
    weekStart: isoDate,
    weeks: z.number().int().min(1).max(52),
    overwrite: z.boolean().default(false),
    /** Si true, supprime aussi les absences (cellules ABSENCE + demandes
     *  AbsenceRequest approuvées) sur la plage. Par défaut `false`, ce
     *  qui préserve les absences (un congé approuvé prime sur le gabarit). */
    deleteAbsences: z.boolean().default(false),
  })
  .refine((v) => v.s1TemplateId || v.s2TemplateId, {
    message: "Au moins un gabarit (S1 ou S2) doit être sélectionné",
  });

export type TemplateEntryInput = z.infer<typeof templateEntryInput>;
export type UpsertTemplateInput = z.infer<typeof upsertTemplateInput>;
export type ApplyBatchInput = z.infer<typeof applyBatchInput>;
