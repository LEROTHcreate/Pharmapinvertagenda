import type { EmployeeStatus } from "@prisma/client";

/**
 * Filtre par métier partagé entre les vues planning (jour / semaine / mois),
 * encodé dans l'URL sous forme `?metier=PHARMACIEN,PREPARATEUR`.
 *
 * Centralise le parsing / la sérialisation pour que toutes les vues et toutes
 * les navigations (prev/next semaine/mois, changement de vue) partagent la même
 * représentation → le filtre persiste et les liens sont partageables.
 */

const VALID_STATUSES: EmployeeStatus[] = [
  "TITULAIRE",
  "PHARMACIEN",
  "PREPARATEUR",
  "ETUDIANT",
  "LIVREUR",
  "BACK_OFFICE",
  "SECRETAIRE",
];
const VALID_SET = new Set<string>(VALID_STATUSES);

/** Parse la valeur brute `?metier=` en Set de statuts valides (ignore le reste). */
export function parseMetier(raw: string | null | undefined): Set<EmployeeStatus> {
  const set = new Set<EmployeeStatus>();
  if (!raw) return set;
  for (const part of raw.split(",")) {
    const token = part.trim().toUpperCase();
    if (VALID_SET.has(token)) set.add(token as EmployeeStatus);
  }
  return set;
}

/** Sérialise le Set en chaîne d'URL déterministe (ordre stable). */
export function serializeMetier(set: Set<EmployeeStatus>): string {
  return VALID_STATUSES.filter((s) => set.has(s)).join(",");
}

/**
 * Ajoute le filtre métier COURANT (lu depuis l'URL du navigateur au moment du
 * clic) à une URL de navigation. Utilisé par les boutons prev/next et le
 * sélecteur de vue pour ne pas perdre le filtre en changeant de période/vue.
 * Lit `window.location` (et non le state du routeur Next) car le filtre est
 * écrit via `history.replaceState`, qui ne met pas à jour `useSearchParams`.
 */
export function appendCurrentMetier(url: string): string {
  if (typeof window === "undefined") return url;
  const raw = new URLSearchParams(window.location.search).get("metier");
  if (!raw) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}metier=${encodeURIComponent(raw)}`;
}
