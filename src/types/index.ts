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
  MISE_EN_RAYON: "Rayon",
  VERIFICATION_STOCKS: "Stocks",
  ROBOT: "Robot",
  REMPLACEMENT: "Rempl",
  ECHANGE: "Echge",
  REUNION_FOURNISSEUR: "Réun.F",
};

export const TASK_DESCRIPTIONS: Record<TaskCode, string> = {
  COMPTOIR: "Comptoir / dispensation",
  COMMANDE: "Réception / gestion commandes",
  MISE_A_PRIX: "Mail / App / Préparatoire",
  PARAPHARMACIE: "Rayon parapharmacie",
  SECRETARIAT: "Tâches administratives",
  MAIL: "Traitement des mails",
  FORMATION: "Formation (sur site)",
  HEURES_SUP: "Heures supplémentaires",
  LIVRAISON: "Livraison",
  MISE_EN_RAYON: "Mise en rayon",
  VERIFICATION_STOCKS: "Vérification des stocks",
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
  PARAPHARMACIE: { bg: "#ffe4e6", text: "#9f1239", border: "#fda4af" },
  SECRETARIAT: { bg: "#ecfccb", text: "#3f6212", border: "#bef264" },
  MAIL: { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
  FORMATION: { bg: "#ccfbf1", text: "#0f766e", border: "#5eead4" },
  HEURES_SUP: { bg: "#ffedd5", text: "#9a3412", border: "#fdba74" },
  LIVRAISON: { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" },
  MISE_EN_RAYON: { bg: "#cffafe", text: "#155e75", border: "#67e8f9" },
  VERIFICATION_STOCKS: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
  ROBOT: { bg: "#c7d2fe", text: "#3730a3", border: "#818cf8" },
  // Échange + Remplacement : MÊME couleur (violet) — ils vont par paire (la
  // personne qui échange son poste ↔ celle qui la remplace). Échange est en
  // plus TEXTURÉ (cf. NON_WORKED_TASKS) pour montrer que la personne n'est pas là.
  REMPLACEMENT: { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
  ECHANGE: { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
  REUNION_FOURNISSEUR: { bg: "#fdf2f8", text: "#831843", border: "#f9a8d4" },
};

/**
 * Postes « non travaillés » : affichés TEXTURÉS (hachures, comme une absence)
 * et EXCLUS du décompte des heures ET de l'effectif.
 *
 * ECHANGE = la personne a échangé son poste → elle n'est PAS présente (ses
 * heures ne comptent pas). C'est son remplaçant (poste REMPLACEMENT, non
 * texturé) qui, lui, est présent et dont les heures comptent.
 */
export const NON_WORKED_TASKS: TaskCode[] = ["ECHANGE"];

/** Vrai si le poste est « non travaillé » (texturé, hors décompte heures). */
export function isNonWorkedTask(code: TaskCode | null | undefined): boolean {
  return !!code && NON_WORKED_TASKS.includes(code);
}

export const ABSENCE_LABELS: Record<AbsenceCode, string> = {
  ABSENT: "Absent",
  CONGE: "Congé",
  MALADIE: "Maladie",
  FORMATION_ABS: "Form. ext.",
};

/**
 * Étiquettes courtes affichées DIRECTEMENT dans la cellule du planning (case
 * de 9 mm de haut). Les absences partagent désormais une même couleur beige
 * (cf. ABSENCE_STYLES) : c'est ce libellé court (ABS / CONGÉ / MAL / FORM) qui
 * distingue le type d'absence.
 */
export const ABSENCE_ICONS: Record<AbsenceCode, string> = {
  ABSENT: "ABS",
  CONGE: "CONGÉ",
  MALADIE: "MAL",
  FORMATION_ABS: "FORM",
};

// Les 4 types d'absence partagent une même couleur BEIGE — le type se
// distingue par le libellé dans la case (ABS / CONGÉ / MAL / FORM), pas par
// la couleur. (Choix produit : uniformiser visuellement les absences.)
const ABSENCE_BEIGE: CellStyle = {
  bg: "#f1ece1",
  text: "#6f6249",
  border: "#dccfb8",
};
export const ABSENCE_STYLES: Record<AbsenceCode, CellStyle> = {
  ABSENT: ABSENCE_BEIGE,
  CONGE: ABSENCE_BEIGE,
  MALADIE: ABSENCE_BEIGE,
  FORMATION_ABS: ABSENCE_BEIGE,
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
  /** True si la cellule vient de l'assignation d'un « Créneau à couvrir ». */
  fromOpenShift?: boolean;
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

/** Créneaux de 30 min de 07:30 à 20:00 : l'officine ferme à 20h, le dernier
 *  créneau démarre donc à 19:30 (tranche 19:30→20:00). */
export const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 7; h <= 19; h++) {
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
