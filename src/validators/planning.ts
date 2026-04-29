import { z } from "zod";

export const TASK_CODES = [
  "COMPTOIR",
  "COMMANDE",
  "MISE_A_PRIX",
  "PARAPHARMACIE",
  "SECRETARIAT",
  "MAIL",
  "FORMATION",
  "HEURES_SUP",
  "LIVRAISON",
  "ROBOT",
  "REMPLACEMENT",
  "ECHANGE",
  "REUNION_FOURNISSEUR",
] as const;

export const ABSENCE_CODES = [
  "ABSENT",
  "CONGE",
  "MALADIE",
  "FORMATION_ABS",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSlot = z.string().regex(/^\d{2}:\d{2}$/);

export const scheduleEntryInput = z
  .object({
    employeeId: z.string().min(1),
    date: isoDate,
    timeSlot,
    type: z.enum(["TASK", "ABSENCE"]),
    taskCode: z.enum(TASK_CODES).nullish(),
    absenceCode: z.enum(ABSENCE_CODES).nullish(),
    notes: z.string().max(500).nullish(),
  })
  .refine(
    (v) =>
      (v.type === "TASK" && !!v.taskCode && !v.absenceCode) ||
      (v.type === "ABSENCE" && !!v.absenceCode && !v.taskCode),
    { message: "type/taskCode/absenceCode incohérents" }
  );

export const bulkPlanningInput = z.object({
  entries: z.array(scheduleEntryInput).max(500),
});

export const deleteEntryInput = z.object({
  employeeId: z.string().min(1),
  date: isoDate,
  timeSlot,
});

export const weekQuery = z.object({
  weekStart: isoDate,
});

export type ScheduleEntryInput = z.infer<typeof scheduleEntryInput>;
export type BulkPlanningInput = z.infer<typeof bulkPlanningInput>;
