import type { ChecklistMoment } from "@prisma/client";

export type ChecklistItemDTO = {
  id: string;
  label: string;
  moment: ChecklistMoment;
  order: number;
  needsNote: boolean;
};

export type ChecklistCheckDTO = {
  itemId: string;
  done: boolean;
  note: string | null;
  checkedByName: string | null;
  /** ISO datetime, ou null si jamais coché. */
  checkedAt: string | null;
};

export const MOMENT_LABELS: Record<ChecklistMoment, string> = {
  OUVERTURE: "Ouverture",
  FERMETURE: "Fermeture",
};

export const MOMENTS: ChecklistMoment[] = ["OUVERTURE", "FERMETURE"];

/**
 * Liste par défaut, créée automatiquement à la 1re utilisation d'une officine
 * (l'admin peut ensuite ajouter / retirer / réordonner). Ordres de grandeur des
 * gestes quotidiens d'ouverture / fermeture en officine.
 */
export const DEFAULT_CHECKLIST: Array<{
  label: string;
  moment: ChecklistMoment;
  needsNote?: boolean;
}> = [
  // ── Ouverture ──
  { label: "Désactiver l'alarme", moment: "OUVERTURE" },
  { label: "Ouvrir le coffre / mettre le fond de caisse", moment: "OUVERTURE" },
  { label: "Relever la température du frigo", moment: "OUVERTURE", needsNote: true },
  { label: "Allumer postes, écrans et éclairage", moment: "OUVERTURE" },
  { label: "Vérifier la vitrine et la propreté du comptoir", moment: "OUVERTURE" },
  { label: "Relever les mails / demandes d'ordonnances", moment: "OUVERTURE" },
  // ── Fermeture ──
  { label: "Compter et fermer la caisse", moment: "FERMETURE" },
  { label: "Relever la température du frigo", moment: "FERMETURE", needsNote: true },
  { label: "Ranger le comptoir et le back-office", moment: "FERMETURE" },
  { label: "Sortir commandes / retours / périmés", moment: "FERMETURE" },
  { label: "Mettre les valeurs au coffre", moment: "FERMETURE" },
  { label: "Verrouiller et activer l'alarme", moment: "FERMETURE" },
];

/** Date du jour (UTC) au format YYYY-MM-DD — cohérent avec le reste de l'app. */
export function checklistToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Valide un paramètre de date YYYY-MM-DD (sinon renvoie aujourd'hui). */
export function safeChecklistDate(input?: string | null): string {
  return input && /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : checklistToday();
}
