import type { EmployeeStatus, TaskCode } from "@prisma/client";

/**
 * Postes universels — autorisés pour TOUS les rôles.
 * REMPLACEMENT et ECHANGE ne sont volontairement plus universels :
 *  - REMPLACEMENT a été retiré complètement (pas utilisé en pratique)
 *  - ECHANGE est désormais réservé aux pharmaciens (échanges de gardes)
 */
const UNIVERSAL_TASKS: TaskCode[] = ["FORMATION", "HEURES_SUP"];

/** Postes spécifiques autorisés par rôle (hors universels) */
const ROLE_SPECIFIC_TASKS: Record<EmployeeStatus, TaskCode[]> = {
  PHARMACIEN: ["COMPTOIR", "ECHANGE"],
  TITULAIRE: ["COMPTOIR", "PARAPHARMACIE", "REUNION_FOURNISSEUR", "LIVRAISON"],
  PREPARATEUR: ["COMPTOIR", "PARAPHARMACIE", "MAIL", "MISE_A_PRIX", "ROBOT"],
  ETUDIANT: ["COMPTOIR"],
  // Livreur : livraisons + mise en rayon + vérification des stocks
  LIVREUR: ["LIVRAISON", "MISE_EN_RAYON", "VERIFICATION_STOCKS"],
  BACK_OFFICE: ["COMMANDE"],
  SECRETAIRE: ["SECRETARIAT", "COMMANDE"],
};

/** Liste complète des postes autorisés pour un rôle donné */
export function getAllowedTasks(status: EmployeeStatus): TaskCode[] {
  return [...ROLE_SPECIFIC_TASKS[status], ...UNIVERSAL_TASKS];
}

/** Vérifie si un poste est autorisé pour un rôle */
export function isTaskAllowed(status: EmployeeStatus, task: TaskCode): boolean {
  return getAllowedTasks(status).includes(task);
}
