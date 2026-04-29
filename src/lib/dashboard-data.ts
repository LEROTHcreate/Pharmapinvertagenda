import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Données partagées par le layout dashboard.
 * Mises en cache (par pharmacie) pour éviter de toucher la BDD à chaque navigation.
 *
 * Tags d'invalidation :
 *  - `pharmacy:<id>`        → quand le nom/réglages de la pharmacie changent
 *  - `users-pending:<id>`   → quand une demande est créée ou traitée
 */

export const getPharmacyHeader = (pharmacyId: string) =>
  unstable_cache(
    async () => {
      return prisma.pharmacy.findUnique({
        where: { id: pharmacyId },
        select: { name: true },
      });
    },
    ["pharmacy-header", pharmacyId],
    { tags: [`pharmacy:${pharmacyId}`], revalidate: 300 }
  )();

export const getPendingUsersCount = (pharmacyId: string) =>
  unstable_cache(
    async () => {
      return prisma.user.count({
        where: { pharmacyId, status: "PENDING" },
      });
    },
    ["users-pending-count", pharmacyId],
    { tags: [`users-pending:${pharmacyId}`], revalidate: 30 }
  )();

/** Compte les demandes d'échange en attente de validation admin (pour le badge sidebar). */
export const getPendingSwapsCount = (pharmacyId: string) =>
  unstable_cache(
    async () => {
      return prisma.shiftSwapRequest.count({
        where: { pharmacyId, status: "PENDING_ADMIN" },
      });
    },
    ["swaps-pending-count", pharmacyId],
    { tags: [`swaps-pending:${pharmacyId}`], revalidate: 30 }
  )();

/** Compte les demandes d'absence en attente de validation admin. */
export const getPendingAbsencesCount = (pharmacyId: string) =>
  unstable_cache(
    async () => {
      return prisma.absenceRequest.count({
        where: { pharmacyId, status: "PENDING" },
      });
    },
    ["absences-pending-count", pharmacyId],
    { tags: [`absences-pending:${pharmacyId}`], revalidate: 30 }
  )();

/**
 * Compte les messages non lus reçus par l'utilisateur, ventilés par type.
 *  - `swap`  = messages SWAP_REQUEST (badge rouge — demande de créneau)
 *  - `text`  = messages TEXT (badge bleu — message classique)
 *
 * Logique « non lu » : pour chaque conversation dont je suis membre, on
 * compte les messages dont l'auteur n'est pas moi et dont la date de
 * création est postérieure à mon `lastReadAt` (ou tous s'il est null).
 *
 * Pas de cache : c'est un signal qui doit rester frais (l'utilisateur
 * vient de recevoir un message, il s'attend à voir le badge tout de suite).
 */
export async function getMessagesUnreadCounts(
  userId: string
): Promise<{ swap: number; text: number }> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true },
  });
  if (memberships.length === 0) return { swap: 0, text: 0 };

  const orConditions = memberships.map((m) => ({
    conversationId: m.conversationId,
    ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
  }));

  const messages = await prisma.message.findMany({
    where: {
      OR: orConditions,
      authorId: { not: userId },
      type: { in: ["TEXT", "SWAP_REQUEST"] },
    },
    select: { type: true },
  });

  let swap = 0;
  let text = 0;
  for (const m of messages) {
    if (m.type === "SWAP_REQUEST") swap++;
    else if (m.type === "TEXT") text++;
  }
  return { swap, text };
}

/** Tags exposés aux APIs pour invalidation après mutation. */
export const DASHBOARD_CACHE_TAGS = {
  pharmacy: (id: string) => `pharmacy:${id}`,
  usersPending: (id: string) => `users-pending:${id}`,
  swapsPending: (id: string) => `swaps-pending:${id}`,
  absencesPending: (id: string) => `absences-pending:${id}`,
};
