import { z } from "zod";

/** Types d'événement d'équipe — miroir de l'enum Prisma TeamEventType. */
export const TEAM_EVENT_TYPES = [
  "REPAS",
  "ANIMATION_LABO",
  "REUNION_FOURNISSEUR",
  "ENTRETIEN",
  "FORMATION",
  "AUTRE",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide");

export const teamEventInput = z.object({
  title: z.string().trim().min(1, "Titre requis").max(100),
  description: z.string().trim().max(500).nullish(),
  date: isoDate,
  time: time.nullish(),
  type: z.enum(TEAM_EVENT_TYPES),
  location: z.string().trim().max(120).nullish(),
});

export type TeamEventInput = z.infer<typeof teamEventInput>;
export type TeamEventType = (typeof TEAM_EVENT_TYPES)[number];
