import { z } from "zod";

/**
 * SIRET français : 14 chiffres exactement. On accepte les espaces dans la
 * saisie utilisateur (les officines l'écrivent souvent groupé) puis on les
 * normalise en `transform`.
 */
const siretSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .refine((v) => /^\d{14}$/.test(v), {
    message: "Le SIRET doit contenir 14 chiffres",
  });

/**
 * Schéma de signup — discriminated union sur `mode` :
 *
 * - **"join"** : l'utilisateur rejoint une officine existante. Il fournit
 *   le SIRET de la pharmacie. Le compte est créé en PENDING/EMPLOYEE,
 *   l'admin titulaire de l'officine valide ensuite.
 *
 * - **"create"** : l'utilisateur crée une nouvelle officine et en devient
 *   l'admin titulaire (APPROVED + actif d'emblée). Il fournit les
 *   informations de l'officine (nom, ville, SIRET, téléphone).
 */
export const signupSchema = z.discriminatedUnion("mode", [
  // ─── Rejoindre une officine existante ──────────────────────────
  z.object({
    mode: z.literal("join"),
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128),
    pharmacySiret: siretSchema,
  }),
  // ─── Créer une nouvelle officine ───────────────────────────────
  z.object({
    mode: z.literal("create"),
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128),
    pharmacyName: z.string().trim().min(2).max(120),
    pharmacySiret: siretSchema,
    pharmacyAddress: z.string().trim().max(200).optional().nullable(),
    pharmacyPhone: z.string().trim().max(30).optional().nullable(),
  }),
]);

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

/**
 * Schéma de mise à jour partielle d'un utilisateur APPROUVÉ.
 *
 * Aujourd'hui sert uniquement à modifier le lien User ↔ Employee post-approbation
 * (cas où l'admin a approuvé sans lier, ou doit corriger une mauvaise liaison).
 *
 * `employeeId` :
 *   - `null` → on retire la liaison (le compte reste actif mais sans fiche planning)
 *   - `string` → on relie au collaborateur ciblé (vérifié côté API : même pharmacie + libre)
 */
export const updateUserSchema = z.object({
  employeeId: z.string().min(1).nullable(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
