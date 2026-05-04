/**
 * Règles d'accès au module Rémunération.
 *
 * Trois niveaux d'autorisation, du plus large au plus restreint :
 *
 *  1. SUPER-ADMIN — admin SANS Employee lié (= compte créateur de la
 *     pharmacie, "pharmagenda"). Toujours accès, peut accorder/révoquer
 *     l'accès aux autres admins. Identifié par : role=ADMIN ET
 *     employeeId est null.
 *
 *  2. ADMIN TITULAIRE AUTORISÉ — admin lié à un Employee.status=TITULAIRE
 *     ET dont le flag User.canAccessPayroll est true. Accès en lecture +
 *     édition des taux horaires. Ne peut PAS accorder l'accès à d'autres.
 *
 *  3. AUTRES — aucun accès au module ni à ses APIs.
 *
 * Pourquoi cette séparation : le super-admin est le compte technique qui
 * a créé la pharmacie. Le titulaire est le pharmacien dirigeant qui gère
 * les paies au quotidien. Cette double délégation évite que n'importe
 * quel admin "secondaire" voie les salaires.
 */

import type { EmployeeStatus, UserRole } from "@prisma/client";

type SessionLike = {
  role: UserRole;
  employeeId?: string | null;
};

type UserContext = {
  role: UserRole;
  employeeId?: string | null;
  canAccessPayroll: boolean;
  /** Statut de l'Employee lié (si lié). Null si aucun lien. */
  employeeStatus?: EmployeeStatus | null;
};

/**
 * Le super-admin = admin créateur, sans fiche Employee. Reconnu par :
 * role=ADMIN + employeeId vide. C'est le seul à pouvoir accorder l'accès
 * Rémunération à d'autres comptes.
 */
export function isSuperAdmin(user: SessionLike): boolean {
  return user.role === "ADMIN" && !user.employeeId;
}

/**
 * Vérifie si l'utilisateur peut VOIR le module Rémunération.
 * - Super-admin : oui d'office.
 * - Admin titulaire avec canAccessPayroll=true : oui.
 * - Tout le reste : non.
 */
export function canViewPayroll(user: UserContext): boolean {
  if (user.role !== "ADMIN") return false;
  if (!user.employeeId) return true; // Super-admin
  if (!user.canAccessPayroll) return false;
  // Pour les admins liés à un Employee, on exige status=TITULAIRE
  return user.employeeStatus === "TITULAIRE";
}

/**
 * Vérifie si l'utilisateur peut MODIFIER les taux horaires + données de paie.
 * Mêmes règles que canViewPayroll pour l'instant — pas de distinction
 * lecture/écriture (un titulaire qui voit la paie peut aussi la modifier).
 */
export function canEditPayroll(user: UserContext): boolean {
  return canViewPayroll(user);
}

/**
 * Vérifie si l'utilisateur peut ACCORDER l'accès Rémunération à un autre
 * admin. Réservé exclusivement au super-admin.
 */
export function canGrantPayrollAccess(user: SessionLike): boolean {
  return isSuperAdmin(user);
}
