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
        select: { name: true, logoUrl: true },
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

/** Compte les demandes d'échange en attente de validation admin (pour le badge sidebar).
 *  Renvoie 0 si la feature shiftSwap est désactivée — pas de badge fantôme. */
export const getPendingSwapsCount = async (pharmacyId: string) => {
  const { FEATURES } = await import("@/lib/features");
  if (!FEATURES.shiftSwap) return 0;
  return unstable_cache(
    async () => {
      return prisma.shiftSwapRequest.count({
        where: { pharmacyId, status: "PENDING_ADMIN" },
      });
    },
    ["swaps-pending-count", pharmacyId],
    { tags: [`swaps-pending:${pharmacyId}`], revalidate: 30 }
  )();
};

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
 * Compte les créneaux à couvrir OUVERTS (non pourvus), aujourd'hui ou à venir.
 * Sert de badge d'appel à l'action sur l'entrée « Absences & remplacements »
 * (visible par tous — les collaborateurs se positionnent). Le résultat est un
 * nombre ; la date « aujourd'hui » reste interne → pas de Date sérialisée en
 * cache (cf. piège unstable_cache + Date).
 */
export const getOpenShiftsCount = (pharmacyId: string) =>
  unstable_cache(
    async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return prisma.openShift.count({
        where: { pharmacyId, status: "OPEN", date: { gte: today } },
      });
    },
    ["open-shifts-count", pharmacyId],
    { tags: [`open-shifts:${pharmacyId}`], revalidate: 30 }
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
 * Caché 10 s (par utilisateur) : 2 requêtes Prisma + agrégation, exécutées à
 * CHAQUE navigation du dashboard → sans cache, ~50-100 ms ajoutés partout. Le
 * badge tolère 10 s de fraîcheur ; la page Messages, elle, poll en direct.
 */
export const getMessagesUnreadCounts = (userId: string) =>
  unstable_cache(
    async (): Promise<{ swap: number; text: number }> => {
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
    },
    ["messages-unread", userId],
    { tags: [`messages-unread:${userId}`], revalidate: 10 }
  )();

/**
 * Contexte d'accès paie de l'utilisateur (flag + statut Employee), pour décider
 * l'affichage de l'item Rémunération dans la sidebar. Mis en cache (revalidate
 * 60 s) : ces valeurs changent rarement → évite une requête à chaque navigation.
 * Invalidable via le tag `user:<id>`.
 */
export const getPayrollUserContext = (userId: string) =>
  unstable_cache(
    async () => {
      return prisma.user.findUnique({
        where: { id: userId },
        select: {
          canAccessPayroll: true,
          employee: { select: { status: true } },
        },
      });
    },
    ["payroll-user-ctx", userId],
    { tags: [`user:${userId}`], revalidate: 60 }
  )();

/** Tags exposés aux APIs pour invalidation après mutation. */
export const DASHBOARD_CACHE_TAGS = {
  pharmacy: (id: string) => `pharmacy:${id}`,
  user: (id: string) => `user:${id}`,
  usersPending: (id: string) => `users-pending:${id}`,
  swapsPending: (id: string) => `swaps-pending:${id}`,
  absencesPending: (id: string) => `absences-pending:${id}`,
  /** Cache du planning d'une semaine spécifique pour une pharmacie. */
  planningWeek: (pharmacyId: string, weekStart: string) =>
    `planning:${pharmacyId}:${weekStart}`,
  /** Tag global "tout le planning d'une pharmacie" — invalidé quand on
   *  ne sait pas exactement quelle semaine est touchée (apply-batch
   *  multi-semaines, drag&drop, etc.). */
  planningAll: (pharmacyId: string) => `planning:${pharmacyId}:*`,
  /** Cache de la liste des gabarits d'une pharmacie. */
  templatesList: (pharmacyId: string) => `templates:${pharmacyId}`,
};

/**
 * Lecture CACHÉE des entrées de planning d'une semaine (lun→dim). Clé + tags
 * IDENTIQUES à /api/planning → l'entrée de cache est PARTAGÉE entre l'API et la
 * page planning, et invalidée par les mutations (POST/DELETE, apply-batch…).
 * Évite de re-taper Postgres à chaque navigation sur la page la plus lourde.
 * `select` restreint aux 8 champs du DTO (pas de sur-fetch).
 */
export const getCachedWeekEntries = (
  pharmacyId: string,
  weekStartIso: string
) =>
  unstable_cache(
    async () => {
      const start = new Date(`${weekStartIso}T00:00:00Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return prisma.scheduleEntry.findMany({
        where: { pharmacyId, date: { gte: start, lte: end } },
        orderBy: [{ date: "asc" }, { timeSlot: "asc" }],
        select: {
          id: true,
          employeeId: true,
          date: true,
          timeSlot: true,
          type: true,
          taskCode: true,
          absenceCode: true,
          notes: true,
          fromOpenShift: true,
        },
      });
    },
    ["planning-week", pharmacyId, weekStartIso],
    {
      tags: [
        DASHBOARD_CACHE_TAGS.planningWeek(pharmacyId, weekStartIso),
        DASHBOARD_CACHE_TAGS.planningAll(pharmacyId),
      ],
      revalidate: 10,
    }
  )();
