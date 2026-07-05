/**
 * RBAC — Rôles de permission de l'application. Source unique de vérité des droits.
 *
 * IMPORTANT : ces rôles de PERMISSION sont distincts du statut MÉTIER
 * (`EmployeeStatus` : pharmacien, préparateur, titulaire…). Un manageur peut
 * être un préparateur, etc. Ne pas confondre.
 *
 * Les fonctions `can…` acceptent le rôle BRUT (tel que stocké en base, type
 * Prisma `UserRole`, y compris l'alias legacy `EMPLOYEE`) et le normalisent
 * en interne — pas besoin d'appeler `normalizeRole` au préalable côté appelant.
 */

import type { UserRole } from "@prisma/client";

/** Les 4 rôles de permission canoniques, du moins au plus puissant. */
export type AppRole = "COLLABORATEUR" | "MANAGEUR" | "ADMIN" | "CREATEUR";

/** Rôle accepté en entrée : canonique OU valeur BDD brute (dont EMPLOYEE legacy). */
export type RoleInput = AppRole | UserRole | string | null | undefined;

/**
 * Normalise un rôle BDD vers l'un des 4 rôles canoniques.
 * `EMPLOYEE` (legacy) → `COLLABORATEUR` ; valeur inconnue/absente → `COLLABORATEUR`
 * (repli le plus restrictif, jamais de sur-privilège par défaut).
 */
export function normalizeRole(role: RoleInput): AppRole {
  switch (role) {
    case "CREATEUR":
      return "CREATEUR";
    case "ADMIN":
      return "ADMIN";
    case "MANAGEUR":
      return "MANAGEUR";
    case "COLLABORATEUR":
    case "EMPLOYEE":
    default:
      return "COLLABORATEUR";
  }
}

/**
 * Rang hiérarchique (croissant). Sert aux comparaisons « strictement
 * supérieur » pour la gestion des utilisateurs.
 *  0 COLLABORATEUR · 1 MANAGEUR · 2 ADMIN (titulaire) · 3 CREATEUR
 */
const RANK: Record<AppRole, number> = {
  COLLABORATEUR: 0,
  MANAGEUR: 1,
  ADMIN: 2,
  CREATEUR: 3,
};

/** Rang numérique d'un rôle brut (après normalisation). */
export function roleRank(role: RoleInput): number {
  return RANK[normalizeRole(role)];
}

/** Libellés FR affichables dans l'UI (par rôle canonique). */
export const ROLE_LABELS: Record<AppRole, string> = {
  CREATEUR: "Créateur",
  ADMIN: "Titulaire",
  MANAGEUR: "Manageur",
  COLLABORATEUR: "Collaborateur",
};

/** Libellé FR d'un rôle brut (normalisé). */
export function roleLabel(role: RoleInput): string {
  return ROLE_LABELS[normalizeRole(role)];
}

/** Le créateur de l'officine — indéracinable, transférable. */
export function isCreator(role: RoleInput): boolean {
  return normalizeRole(role) === "CREATEUR";
}

/* ─── Capacités fonctionnelles ───────────────────────────────────── */

/** Éditer le planning (manageur, titulaire, créateur). */
export function canEditPlanning(role: RoleInput): boolean {
  return roleRank(role) >= RANK.MANAGEUR;
}

/** Appliquer les gabarits S1/S2. */
export function canApplyTemplates(role: RoleInput): boolean {
  return roleRank(role) >= RANK.MANAGEUR;
}

/** Gérer l'équipe (CRUD des fiches collaborateurs du planning). */
export function canManageTeam(role: RoleInput): boolean {
  return roleRank(role) >= RANK.MANAGEUR;
}

/** Valider / refuser les demandes d'absence et d'échange (titulaire+). */
export function canValidateAbsences(role: RoleInput): boolean {
  return roleRank(role) >= RANK.ADMIN;
}

/** Approuver / refuser les nouvelles inscriptions (titulaire+). */
export function canApproveUsers(role: RoleInput): boolean {
  return roleRank(role) >= RANK.ADMIN;
}

/** Accès au module Rémunération (titulaire+ ; remplace le flag canAccessPayroll). */
export function canAccessPayroll(role: RoleInput): boolean {
  return roleRank(role) >= RANK.ADMIN;
}

/** Modifier les paramètres de l'officine (effectif min, logo, SIRET) (titulaire+). */
export function canEditSettings(role: RoleInput): boolean {
  return roleRank(role) >= RANK.ADMIN;
}

/**
 * « Administrateur » au sens large = tout ce qui, avant la refonte, exigeait
 * `role === "ADMIN"` sans distinction de capacité. Sert de repli sûr là où la
 * capacité précise n'est pas encore branchée. = titulaire ou créateur.
 */
export function isAdminLevel(role: RoleInput): boolean {
  return roleRank(role) >= RANK.ADMIN;
}

/**
 * Voir le planning complet de l'équipe. Décision produit : TOUS les rôles le
 * voient (le collaborateur en lecture seule — comportement actuel conservé).
 */
export function canViewTeamPlanning(_role: RoleInput): boolean {
  return true;
}

/* ─── Gestion des utilisateurs (hiérarchie + protection du créateur) ── */

/**
 * `actor` peut-il gérer `target` (changer son rôle, le désactiver, le supprimer) ?
 *  - le créateur est INTOUCHABLE (personne ne peut le gérer) ;
 *  - seuls titulaire+ gèrent des utilisateurs ;
 *  - l'acteur doit avoir un rang STRICTEMENT supérieur à la cible
 *    (donc un titulaire ne peut pas rétrograder un autre titulaire — seul le
 *    créateur le peut).
 */
export function canManageUser(actor: RoleInput, target: RoleInput): boolean {
  if (isCreator(target)) return false;
  if (!canApproveUsers(actor)) return false;
  return roleRank(actor) > roleRank(target);
}

/** Seul le créateur peut transférer son rôle de créateur à un autre. */
export function canTransferOwnership(role: RoleInput): boolean {
  return isCreator(role);
}

/**
 * Rôles qu'un acteur a le droit d'ATTRIBUER lors d'une approbation/édition.
 * On n'attribue JAMAIS `CREATEUR` par ce biais (uniquement via transfert).
 * Un titulaire et un créateur peuvent attribuer titulaire/manageur/collaborateur.
 */
export function assignableRoles(actor: RoleInput): AppRole[] {
  if (!canApproveUsers(actor)) return [];
  return ["ADMIN", "MANAGEUR", "COLLABORATEUR"];
}
