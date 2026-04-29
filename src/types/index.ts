import type {
  AbsenceCode,
  EmployeeStatus,
  ScheduleType,
  TaskCode,
  UserRole,
} from "@prisma/client";

// ─── Codes & libellés ────────────────────────────────────────────

export const TASK_LABELS: Record<TaskCode, string> = {
  COMPTOIR: "Cptoir",
  COMMANDE: "Comde",
  MISE_A_PRIX: "M/A/P",
  PARAPHARMACIE: "Para",
  SECRETARIAT: "Secrét",
  MAIL: "Mail",
  FORMATION: "Form°",
  HEURES_SUP: "H Sup",
  LIVRAISON: "Livrais",
  ROBOT: "Robot",
  REMPLACEMENT: "Rempl",
  ECHANGE: "Echge",
  REUNION_FOURNISSEUR: "Réun.F",
};

export const TASK_DESCRIPTIONS: Record<TaskCode, string> = {
  COMPTOIR: "Comptoir / dispensation",
  COMMANDE: "Réception / gestion commandes",
  MISE_A_PRIX: "Mise à prix / étiquetage",
  PARAPHARMACIE: "Rayon parapharmacie",
  SECRETARIAT: "Tâches administratives",
  MAIL: "Traitement des mails",
  FORMATION: "Formation (sur site)",
  HEURES_SUP: "Heures supplémentaires",
  LIVRAISON: "Livraison",
  ROBOT: "Gestion robot de dispensation",
  REMPLACEMENT: "Remplacement",
  ECHANGE: "Échange de poste",
  REUNION_FOURNISSEUR: "Réunion fournisseurs / labo",
};

export type CellStyle = { bg: string; text: string; border: string };

/** Couleurs d'affichage des tâches dans la grille (style inline) */
export const TASK_COLORS: Record<TaskCode, CellStyle> = {
  COMPTOIR: { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
  COMMANDE: { bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
  MISE_A_PRIX: { bg: "#f3e8ff", text: "#6b21a8", border: "#d8b4fe" },
  PARAPHARMACIE: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
  SECRETARIAT: { bg: "#fce7f3", text: "#9d174d", border: "#f9a8d4" },
  MAIL: { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
  FORMATION: { bg: "#e0e7ff", text: "#3730a3", border: "#a5b4fc" },
  HEURES_SUP: { bg: "#ffedd5", text: "#9a3412", border: "#fdba74" },
  LIVRAISON: { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" },
  ROBOT: { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
  REMPLACEMENT: { bg: "#e2e8f0", text: "#1e293b", border: "#94a3b8" },
  ECHANGE: { bg: "#a7f3d0", text: "#064e3b", border: "#34d399" },
  REUNION_FOURNISSEUR: { bg: "#fdf2f8", text: "#831843", border: "#f9a8d4" },
};

export const ABSENCE_LABELS: Record<AbsenceCode, string> = {
  ABSENT: "Absent",
  CONGE: "Congé",
  MALADIE: "Maladie",
  FORMATION_ABS: "Form. ext.",
};

export const ABSENCE_ICONS: Record<AbsenceCode, string> = {
  ABSENT: "○",
  CONGE: "☀",
  MALADIE: "✚",
  FORMATION_ABS: "▣",
};

export const ABSENCE_STYLES: Record<AbsenceCode, CellStyle> = {
  ABSENT: { bg: "#f3f4f6", text: "#6b7280", border: "#d1d5db" },
  CONGE: { bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
  MALADIE: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
  FORMATION_ABS: { bg: "#e0e7ff", text: "#3730a3", border: "#a5b4fc" },
};

/**
 * Libellés des rôles, avec le féminin entre parenthèses quand le mot
 * est genré. Les rôles épicènes (Secrétaire, Titulaire, Back-office)
 * restent inchangés.
 */
export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  PHARMACIEN: "Pharmacien(ne)",
  PREPARATEUR: "Préparateur(trice)",
  ETUDIANT: "Étudiant(e)",
  LIVREUR: "Livreur(euse)",
  BACK_OFFICE: "Back-office",
  SECRETAIRE: "Secrétaire",
  TITULAIRE: "Titulaire",
};

// ─── DTOs ────────────────────────────────────────────────────────

export type ScheduleEntryDTO = {
  id: string;
  employeeId: string;
  date: string; // ISO YYYY-MM-DD
  timeSlot: string; // "HH:MM"
  type: ScheduleType;
  taskCode: TaskCode | null;
  absenceCode: AbsenceCode | null;
  notes: string | null;
};

export type EmployeeDTO = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: number;
  displayColor: string;
  displayOrder: number;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  pharmacyId: string;
  employeeId: string | null;
};

// ─── Constantes planning ─────────────────────────────────────────

/** Créneaux de 30 min de 07:30 à 22:00 (le dernier créneau démarre à 21:30) */
export const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 7; h <= 21; h++) {
    const hh = h.toString().padStart(2, "0");
    if (h === 7) {
      slots.push(`${hh}:30`);
    } else {
      slots.push(`${hh}:00`);
      slots.push(`${hh}:30`);
    }
  }
  return slots;
})();

/** Durée d'un créneau en heures */
export const SLOT_HOURS = 0.5;

/** Jours de la semaine (Lundi → Samedi) */
export const WEEK_DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

export const WEEK_DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;
