import type { ContractType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Cycle de vie d'un collaborateur — désactivation automatique.
 *
 * Un collaborateur bascule automatiquement en INACTIF (isActive=false) quand :
 *  - sa date de départ (`departureDate`) est atteinte (≤ aujourd'hui), OU
 *  - son contrat n'est pas un CDI ET sa date de fin de contrat
 *    (`contractEndDate`) est passée (< aujourd'hui) — contrat non renouvelé.
 *
 * La période d'essai (`trialEndDate`) NE désactive JAMAIS : c'est un simple
 * rappel (à la fin de l'essai, le collaborateur continue par défaut).
 *
 * La désactivation ne SUPPRIME rien : le planning, les heures et l'historique
 * paie du collaborateur restent intacts, il disparaît seulement de la grille
 * active. Un titulaire peut toujours le réactiver manuellement (il faut alors
 * repousser/effacer la date, sinon le prochain passage le redésactive).
 */

type LifecycleFields = {
  isActive: boolean;
  contractType: ContractType;
  contractEndDate: Date | string | null;
  departureDate: Date | string | null;
};

/** Normalise une date (Date | ISO string) en "YYYY-MM-DD", ou null. */
function toDayIso(d: Date | string | null): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Le collaborateur DEVRAIT-il être inactif à la date `todayIso` (YYYY-MM-DD) ?
 * Fonction pure — ne considère que les collaborateurs actuellement actifs
 * (on ne réactive jamais automatiquement).
 */
export function shouldBeInactive(
  emp: LifecycleFields,
  todayIso: string
): boolean {
  if (!emp.isActive) return false;

  const departure = toDayIso(emp.departureDate);
  if (departure && departure <= todayIso) return true;

  if (emp.contractType !== "CDI") {
    const end = toDayIso(emp.contractEndDate);
    // Contrat à durée déterminée arrivé à terme (strictement passé) → fin.
    if (end && end < todayIso) return true;
  }

  return false;
}

/**
 * Désactive en base tous les collaborateurs d'une pharmacie dont l'échéance
 * est atteinte. Idempotent : ne touche que les lignes qui changent réellement.
 * Retourne le nombre de collaborateurs désactivés.
 *
 * À appeler au chargement des pages titulaire (force-dynamic), en amont du
 * rendu, pour que la grille reflète toujours l'état à jour.
 */
export async function sweepInactiveEmployees(
  pharmacyId: string,
  todayIso: string
): Promise<number> {
  // On récupère les candidats potentiels (actifs avec une échéance renseignée)
  // puis on applique la règle pure avant d'écrire.
  const candidates = await prisma.employee.findMany({
    where: {
      pharmacyId,
      isActive: true,
      OR: [{ departureDate: { not: null } }, { contractEndDate: { not: null } }],
    },
    select: {
      id: true,
      isActive: true,
      contractType: true,
      contractEndDate: true,
      departureDate: true,
    },
  });

  const toDeactivate = candidates
    .filter((e) => shouldBeInactive(e, todayIso))
    .map((e) => e.id);

  if (toDeactivate.length === 0) return 0;

  await prisma.employee.updateMany({
    where: { id: { in: toDeactivate }, pharmacyId },
    data: { isActive: false },
  });

  return toDeactivate.length;
}
