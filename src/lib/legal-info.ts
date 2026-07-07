/**
 * Informations légales de l'éditeur (mentions légales — LCEN art. 6).
 *
 * Renseignées via variables d'environnement (Vercel → Settings → Environment
 * Variables) pour ne pas coder en dur des données d'entreprise et pouvoir les
 * mettre à jour sans redéploiement de code. Chaque champ manquant s'affiche
 * comme « à renseigner » sur la page (repli honnête, jamais de `{{TOKEN}}`).
 *
 * Variables attendues (toutes optionnelles techniquement, mais requises
 * légalement avant ouverture commerciale) :
 *   LEGAL_RAISON_SOCIALE, LEGAL_FORME_JURIDIQUE, LEGAL_CAPITAL_SOCIAL,
 *   LEGAL_ADRESSE_SIEGE, LEGAL_SIRET, LEGAL_RCS, LEGAL_TVA_INTRA,
 *   LEGAL_TELEPHONE, LEGAL_EMAIL, LEGAL_DIRECTEUR_PUBLICATION,
 *   LEGAL_QUALITE_DIRECTEUR
 */

export type LegalField = {
  /** Valeur renseignée, ou null si la variable d'env est absente/vide. */
  value: string | null;
  /** Nom de la variable d'environnement source (affiché dans le repli). */
  envVar: string;
};

function field(envVar: string): LegalField {
  const v = process.env[envVar]?.trim();
  return { value: v && v.length > 0 ? v : null, envVar };
}

export const LEGAL = {
  raisonSociale: field("LEGAL_RAISON_SOCIALE"),
  formeJuridique: field("LEGAL_FORME_JURIDIQUE"),
  capitalSocial: field("LEGAL_CAPITAL_SOCIAL"),
  adresseSiege: field("LEGAL_ADRESSE_SIEGE"),
  siret: field("LEGAL_SIRET"),
  rcs: field("LEGAL_RCS"),
  tvaIntra: field("LEGAL_TVA_INTRA"),
  telephone: field("LEGAL_TELEPHONE"),
  directeurPublication: field("LEGAL_DIRECTEUR_PUBLICATION"),
  qualiteDirecteur: field("LEGAL_QUALITE_DIRECTEUR"),
  /** Email de contact — défaut sûr si non défini. */
  email: process.env.LEGAL_EMAIL?.trim() || "contact@pharmaplanning.fr",
};

/**
 * Les mentions légales sont-elles complètes (champs indispensables) ?
 * Sert à afficher un rappel discret tant que ce n'est pas le cas.
 */
export function legalInfoComplete(): boolean {
  return [
    LEGAL.raisonSociale,
    LEGAL.formeJuridique,
    LEGAL.adresseSiege,
    LEGAL.siret,
    LEGAL.directeurPublication,
  ].every((f) => f.value !== null);
}
