import type { EmployeeStatus } from "@prisma/client";

/**
 * Palettes de couleurs par rôle.
 * Chaque collaborateur d'un même rôle obtient une nuance distincte
 * dans la même famille — ça donne une "vision d'ensemble" très lisible
 * (tous les préparateurs en vert, tous les pharmaciens en violet, etc.).
 */
export const ROLE_PALETTE: Record<EmployeeStatus, string[]> = {
  // Titulaires — rouges
  TITULAIRE: [
    "#dc2626", // rouge vif
    "#b91c1c", // rouge foncé
    "#ef4444", // rouge clair
    "#991b1b", // rouge sombre
    "#f87171", // rouge pastel
  ],
  // Pharmaciens — violets / pourpres
  PHARMACIEN: [
    "#7c3aed", // violet
    "#6d28d9", // violet foncé
    "#8b5cf6", // violet clair
    "#a855f7", // pourpre
    "#9333ea", // pourpre profond
    "#5b21b6", // violet sombre
    "#c084fc", // mauve
  ],
  // Préparateurs — verts
  PREPARATEUR: [
    "#16a34a", // vert principal
    "#15803d", // vert foncé
    "#22c55e", // vert vif
    "#10b981", // émeraude
    "#059669", // vert sapin
    "#14b8a6", // teal
    "#65a30d", // lime foncé
    "#4ade80", // vert clair
    "#84cc16", // lime
    "#166534", // vert très foncé
  ],
  // Étudiants — ambres / jaunes
  ETUDIANT: [
    "#f59e0b", // ambre
    "#d97706", // ambre foncé
    "#fbbf24", // jaune
    "#eab308", // jaune doré
    "#b45309", // ambre brûlé
    "#facc15", // jaune clair
  ],
  // Livreurs — slate / gris bleus
  LIVREUR: [
    "#475569", // slate
    "#334155", // slate foncé
    "#64748b", // slate moyen
    "#6b7280", // gris neutre
  ],
  // Back-office — bleus ciel
  BACK_OFFICE: [
    "#0ea5e9", // sky
    "#0284c7", // sky foncé
    "#38bdf8", // sky clair
    "#0369a1", // bleu profond
    "#0891b2", // cyan
  ],
  // Secrétaires — roses / magentas
  SECRETAIRE: [
    "#ec4899", // rose
    "#db2777", // rose foncé
    "#f472b6", // rose clair
    "#be185d", // framboise
    "#e11d48", // rose vif
    "#f43f5e", // corail
  ],
};

/**
 * Couleur "représentative" du rôle (utilisée en légende, en pastille de groupe).
 */
export const ROLE_COLOR: Record<EmployeeStatus, string> = {
  TITULAIRE: ROLE_PALETTE.TITULAIRE[0],
  PHARMACIEN: ROLE_PALETTE.PHARMACIEN[0],
  PREPARATEUR: ROLE_PALETTE.PREPARATEUR[0],
  ETUDIANT: ROLE_PALETTE.ETUDIANT[0],
  LIVREUR: ROLE_PALETTE.LIVREUR[0],
  BACK_OFFICE: ROLE_PALETTE.BACK_OFFICE[0],
  SECRETAIRE: ROLE_PALETTE.SECRETAIRE[0],
};

/**
 * Renvoie une couleur déterministe pour un collaborateur donné, selon son rôle
 * et son rang dans la liste des collaborateurs du même rôle (0-indexé).
 * Cycle si plus de collaborateurs que de couleurs dans la palette.
 */
export function pickRoleColor(
  status: EmployeeStatus,
  indexWithinRole: number
): string {
  const palette = ROLE_PALETTE[status];
  return palette[indexWithinRole % palette.length];
}
