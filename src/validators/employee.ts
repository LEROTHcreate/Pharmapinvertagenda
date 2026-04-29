import { z } from "zod";

export const EMPLOYEE_STATUSES = [
  "PHARMACIEN",
  "PREPARATEUR",
  "ETUDIANT",
  "LIVREUR",
  "BACK_OFFICE",
  "SECRETAIRE",
  "TITULAIRE",
] as const;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur attendue au format #RRGGBB");

export const employeeInput = z.object({
  firstName: z.string().min(1, "Prénom requis").max(60),
  lastName: z.string().min(1, "Nom requis").max(60),
  status: z.enum(EMPLOYEE_STATUSES),
  weeklyHours: z
    .number({ message: "Heures hebdo requises" })
    .min(0, "Doit être ≥ 0")
    .max(80, "Max 80h"),
  displayColor: hexColor.default("#6366f1"),
  displayOrder: z.number().int().min(0).default(0),
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue YYYY-MM-DD")
    .nullish(),
  isActive: z.boolean().default(true),
});

export type EmployeeInput = z.infer<typeof employeeInput>;
