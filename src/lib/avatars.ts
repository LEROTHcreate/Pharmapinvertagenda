/**
 * Catalogue des avatars proposés aux collaborateurs.
 *
 * Les fichiers PNG sont dans `/public/avatars/<id>.png`. L'ID est stocké en
 * BDD sur `User.avatarId`. Si l'utilisateur n'a rien choisi, on retombe sur
 * la pastille colorée avec la 1re lettre du prénom (cf. AvatarImage).
 */

export type AvatarId =
  | "paracetamol"
  | "ibuprofen"
  | "probiotic"
  | "melatonin"
  | "inhaler"
  | "sunscreen"
  | "vitamin-c"
  | "electrolyte"
  | "anti-inflammatory";

export type AvatarOption = {
  id: AvatarId;
  label: string;
  description: string;
  /** Chemin public de l'image (1024×1024 PNG transparent). */
  src: string;
};

export const AVATARS: AvatarOption[] = [
  {
    id: "paracetamol",
    label: "Paracetamol",
    description: "Le zen équilibré, qui prend soin de tout le monde",
    src: "/avatars/paracetamol.png",
  },
  {
    id: "ibuprofen",
    label: "Ibuprofen",
    description: "Le sportif énergique, toujours en mouvement",
    src: "/avatars/ibuprofen.png",
  },
  {
    id: "probiotic",
    label: "Probiotic",
    description: "Le bienveillant, entouré de bonnes ondes",
    src: "/avatars/probiotic.png",
  },
  {
    id: "melatonin",
    label: "Melatonin",
    description: "Le rêveur étoilé, qui apaise les fins de journée",
    src: "/avatars/melatonin.png",
  },
  {
    id: "inhaler",
    label: "Inhaler",
    description: "Le calme respirant, sur son nuage",
    src: "/avatars/inhaler.png",
  },
  {
    id: "sunscreen",
    label: "Sunscreen",
    description: "L'estival cool, chapeau de paille en toute saison",
    src: "/avatars/sunscreen.png",
  },
  {
    id: "vitamin-c",
    label: "Vitamine C",
    description: "Le rayonnant, qui réveille les matins",
    src: "/avatars/vitamin-c.png",
  },
  {
    id: "electrolyte",
    label: "Electrolyte",
    description: "Le coach hydratation, gourde à la main",
    src: "/avatars/electrolyte.png",
  },
  {
    id: "anti-inflammatory",
    label: "Anti-inflammatoire",
    description: "Le frais qui calme les tensions",
    src: "/avatars/anti-inflammatory.png",
  },
];

const AVATARS_BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

/** Renvoie l'avatar correspondant à un ID, ou null si l'ID est inconnu/null. */
export function getAvatar(id: string | null | undefined): AvatarOption | null {
  if (!id) return null;
  return AVATARS_BY_ID.get(id as AvatarId) ?? null;
}

/** Garde-fou pour valider une saisie utilisateur (API PATCH /profile). */
export function isValidAvatarId(id: string): id is AvatarId {
  return AVATARS_BY_ID.has(id as AvatarId);
}
