/**
 * RBAC — Rôles de permission de l'application.  ⚠ BROUILLON NON BRANCHÉ.
 *
 * Source unique de vérité des droits, à connecter APRÈS la migration auth
 * (quand l'enum Prisma `UserRole` aura les 4 valeurs). Spec validée le
 * 2026-06-30 — cf. mémoire projet `rbac-4-roles`.
 *
 * IMPORTANT : ces rôles de PERMISSION sont distincts du statut MÉTIER
 * (`EmployeeStatus` : pharmacien, préparateur, titulaire…). Un manageur peut
 * être un préparateur, etc. Ne pas confondre.
 *
 * Quand on branchera : faire correspondre `AppRole` à l'enum Prisma `UserRole`
 * (CREATEUR / ADMIN / MANAGEUR / COLLABORATEUR) et remplacer les
 * `role === "ADMIN"` éparpillés dans les routes par ces fonctions.
 */

/** Les 4 rôles de permission, du moins au plus puissant. */
export type AppRole = "COLLABORATEUR" | "MANAGEUR" | "ADMIN" | "CREATEUR";

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

/** Libellés FR affichables dans l'UI. */
export const ROLE_LABELS: Record<AppRole, string> = {
  CREATEUR: "Créateur",
  ADMIN: "Titulaire",
  MANAGEUR: "Manageur",
  COLLABORATEUR: "Collaborateur",
};

/** Le créateur de l'officine — indéracinable, transférable. */
export function isCreator(role: AppRole): boolean {
  return role === "CREATEUR";
}

/* ─── Capacités fonctionnelles ───────────────────────────────────── */

/** Éditer le planning (manageur, titulaire, créateur). */
export function canEditPlanning(role: AppRole): boolean {
  return RANK[role] >= RANK.MANAGEUR;
}

/** Appliquer les gabarits S1/S2. */
export function canApplyTemplates(role: AppRole): boolean {
  return RANK[role] >= RANK.MANAGEUR;
}

/** Gérer l'équipe (CRUD des fiches collaborateurs du planning). */
export function canManageTeam(role: AppRole): boolean {
  return RANK[role] >= RANK.MANAGEUR;
}

/** Valider / refuser les demandes d'absence et d'échange (titulaire+). */
export function canValidateAbsences(role: AppRole): boolean {
  return RANK[role] >= RANK.ADMIN;
}

/** Approuver / refuser les nouvelles inscriptions (titulaire+). */
export function canApproveUsers(role: AppRole): boolean {
  return RANK[role] >= RANK.ADMIN;
}

/** Accès au module Rémunération (titulaire+ ; remplace le flag canAccessPayroll). */
export function canAccessPayroll(role: AppRole): boolean {
  return RANK[role] >= RANK.ADMIN;
}

/** Modifier les paramètres de l'officine (effectif min, logo, SIRET) (titulaire+). */
export function canEditSettings(role: AppRole): boolean {
  return RANK[role] >= RANK.ADMIN;
}

/**
 * Voir le planning complet de l'équipe. Décision produit : TOUS les rôles le
 * voient (le collaborateur en lecture seule — comportement actuel conservé).
 */
export function canViewTeamPlanning(_role: AppRole): boolean {
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
export function canManageUser(actor: AppRole, target: AppRole): boolean {
  if (isCreator(target)) return false;
  if (!canApproveUsers(actor)) return false;
  return RANK[actor] > RANK[target];
}

/** Seul le créateur peut transférer son rôle de créateur à un autre. */
export function canTransferOwnership(role: AppRole): boolean {
  return isCreator(role);
}

/**
 * Rôles qu'un acteur a le droit d'ATTRIBUER lors d'une approbation/édition.
 * On n'attribue JAMAIS `CREATEUR` par ce biais (uniquement via transfert).
 * Un titulaire et un créateur peuvent attribuer titulaire/manageur/collaborateur.
 */
export function assignableRoles(actor: AppRole): AppRole[] {
  if (!canApproveUsers(actor)) return [];
  return ["ADMIN", "MANAGEUR", "COLLABORATEUR"];
}
