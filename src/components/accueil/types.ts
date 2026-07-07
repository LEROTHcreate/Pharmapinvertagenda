/** Types partagés du tableau de bord Accueil (page → vues mobile/desktop). */

import type { UserRole } from "@prisma/client";
import type { NewsItem } from "@/lib/pharmacy-news";

export type PersonRef = { id: string; name: string; color: string };
export type AbsentRef = PersonRef & { label: string };
export type DayBlock = {
  from: string;
  to: string;
  label: string;
  isAbsence: boolean;
};
export type NextGarde = {
  name: string;
  typeLabel: string;
  dateLabel: string;
  daysUntil: number;
};

export type AccueilData = {
  firstName: string | null;
  dateLabel: string;
  /** Niveau admin (titulaire/créateur) — validations, stats, gardes, users. */
  isAdmin: boolean;
  /** Rôle brut : gate fin des raccourcis (Manageur voit Gabarits/Équipe). */
  role: UserRole;
  /** Accès au module Rémunération (titulaire autorisé / super-admin). */
  canViewPayroll: boolean;
  /** Actu pharmacie (barre latérale « Actus »). */
  news: NewsItem[];
  myDay: { hours: number; blocks: DayBlock[] } | null;
  myWeek: { done: number; contract: number } | null;
  nextSlot: { when: string; from: string; label: string } | null;
  teamPresent: number;
  teamSize: number;
  /** Effectif minimum paramétré pour l'officine (seuil de sous-effectif). */
  minStaff: number;
  presentBySlot: Record<string, number>;
  presentToday: PersonRef[];
  absentsToday: AbsentRef[];
  nextGarde: NextGarde | null;
  pendingAbsences: number;
  pendingUsers: number;
  pendingSwaps: number;
  unreadMessages: number;
};
