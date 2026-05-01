import { z } from "zod";

/** Schéma de demande d'inscription (mono-pharmacie pour l'instant). */
export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

/** Demande de réinitialisation : on prend juste l'email. */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/** Réinitialisation effective avec le token reçu par email. */
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(128),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** Schéma de validation d'une demande par un admin. */
export const reviewUserSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  // Rôle requis uniquement en cas d'approbation
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
  // Optionnel : collaborateur du planning à associer au compte (lien User <-> Employee)
  // null/undefined = pas de liaison (à faire plus tard via /employes)
  employeeId: z.string().min(1).nullish(),
  // Note optionnelle (motif de refus, etc.)
  note: z.string().trim().max(280).optional(),
});

export type ReviewUserInput = z.infer<typeof reviewUserSchema>;
