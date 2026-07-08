import type { TeamEventType } from "@/validators/team-event";

/**
 * Style partagé des événements d'équipe (libellé + couleurs de confettis).
 * Utilisé par le panneau « La vie de l'équipe » (page Équipe), l'accueil et le
 * bas du planning — pour que la fête « jour J » soit cohérente partout.
 */
export const TEAM_EVENT_LABEL: Record<TeamEventType, string> = {
  REPAS: "Repas d'équipe",
  ANIMATION_LABO: "Animation labo",
  REUNION_FOURNISSEUR: "Réunion fournisseur",
  ENTRETIEN: "Entretien",
  FORMATION: "Formation",
  AUTRE: "Événement",
};

export const TEAM_EVENT_CONFETTI: Record<TeamEventType, string[]> = {
  REPAS: ["#f59e0b", "#fb923c", "#fbbf24", "#fde68a"],
  ANIMATION_LABO: ["#a855f7", "#d946ef", "#c084fc", "#f0abfc"],
  REUNION_FOURNISSEUR: ["#0ea5e9", "#38bdf8", "#60a5fa", "#7dd3fc"],
  ENTRETIEN: ["#10b981", "#14b8a6", "#34d399", "#5eead4"],
  FORMATION: ["#6366f1", "#818cf8", "#60a5fa", "#a5b4fc"],
  AUTRE: ["#f43f5e", "#ec4899", "#fb7185", "#fbbf24"],
};