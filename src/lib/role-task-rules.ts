import type { EmployeeStatus, TaskCode } from "@prisma/client";

/**
 * Postes universels — autorisés pour TOUS les rôles.
 * ECHANGE + REMPLACEMENT sont universels : un échange de poste peut concerner
 * n'importe quel collaborateur (celui qui échange = ECHANGE, texturé/non
 * compté ; celui qui prend sa place = REMPLACEMENT, compté). MAIL a été retiré.
 */
const UNIVERSAL_TASKS: TaskCode[] = [
  "FORMATION",
  "HEURES_SUP",
  "ECHANGE",
  "REMPLACEMENT",
];

/** Postes spécifiques autorisés par rôle (hors universels) */
const ROLE_SPECIFIC_TASKS: Record<EmployeeStatus, TaskCode[]> = {
  PHARMACIEN: ["COMPTOIR"],
  TITULAIRE: ["COMPTOIR", "PARAPHARMACIE", "REUNION_FOURNISSEUR", "LIVRAISON"],
  PREPARATEUR: ["COMPTOIR", "PARAPHARMACIE", "MISE_A_PRIX", "ROBOT"],
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
