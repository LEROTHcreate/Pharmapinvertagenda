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

export type TemplateEntryInput = z.infer<typeof templateEntryInput>;
export type UpsertTemplateInput = z.infer<typeof upsertTemplateInput>;
