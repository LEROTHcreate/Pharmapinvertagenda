/**
 * Catalogue des avatars proposés aux collaborateurs.
 *
 * Les fichiers PNG sont dans `/public/avatars/<id>.png`. L'ID est stocké en
 * BDD sur `User.avatarId`. Si l'utilisateur n'a rien choisi, on retombe sur
 * la pastille colorée avec la 1re lettre du prénom (cf. AvatarImage).
 */

export type AvatarId =
  | "paracetamol"
  | "aspirin"
  | "ibuprofen"
  | "anti-inflammatory"
  | "antacid"
  | "probiotic"
  | "melatonin"
  | "sleeping-aid"
  | "inhaler"
  | "decongestant"
  | "cough-syrup"
  | "antihistamine"
  | "eye-drops"
  | "sunscreen"
  | "vitamin-c"
  | "vitamin-d"
  | "electrolyte"
  | "bandage"
  | "antiseptic"
  | "arnica"
  | "prescription"
  | "tensiometre"
  | "robot";

export type AvatarOption = {
  id: AvatarId;
  label: string;
  description: string;
  /** Chemin public de l'image (1024×1024 PNG transparent). */
  src: string;
};

export const AVATARS: AvatarOption[] = [
  // ─── Douleur & inflammation ────────────────────────────────────
  {
    id: "paracetamol",
    label: "Paracetamol",
    description: "Le zen équilibré, qui prend soin de tout le monde",
    src: "/avatars/paracetamol.png",
  },
  {
    id: "aspirin",
    label: "Aspirine",
    description: "Le sage à lunettes et nœud papillon, classique intemporel",
    src: "/avatars/aspirin.png",
  },
  {
    id: "ibuprofen",
    label: "Ibuprofen",
    description: "Le sportif énergique, toujours en mouvement",
    src: "/avatars/ibuprofen.png",
  },
  {
    id: "anti-inflammatory",
    label: "Anti-inflammatoire",
    description: "Le frais qui calme les tensions",
    src: "/avatars/anti-inflammatory.png",
  },

  // ─── Digestion ─────────────────────────────────────────────────
  {
    id: "antacid",
    label: "Antiacide",
    description: "Le pompier des brûlures d'estomac",
    src: "/avatars/antacid.png",
  },
  {
    id: "probiotic",
    label: "Probiotic",
    description: "Le bienveillant, entouré de bonnes ondes",
    src: "/avatars/probiotic.png",
  },

  // ─── Sommeil & sérénité ────────────────────────────────────────
  {
    id: "melatonin",
    label: "Mélatonine",
    description: "Le rêveur étoilé, qui apaise les fins de journée",
    src: "/avatars/melatonin.png",
  },
  {
    id: "sleeping-aid",
    label: "Somnifère",
    description: "Le marchand de sable, bonnet et lune en main",
    src: "/avatars/sleeping-aid.png",
  },

  // ─── Respiratoire ──────────────────────────────────────────────
  {
    id: "inhaler",
    label: "Inhalateur",
    description: "Le calme respirant, sur son nuage",
    src: "/avatars/inhaler.png",
  },
  {
    id: "decongestant",
    label: "Décongestionnant",
    description: "Le souffleur de menthol, qui dégage les nez bouchés",
    src: "/avatars/decongestant.png",
  },
  {
    id: "cough-syrup",
    label: "Sirop pour la toux",
    description: "Le ténor en écharpe, qui adoucit les voix enrouées",
    src: "/avatars/cough-syrup.png",
  },

  // ─── Allergie & yeux & peau ────────────────────────────────────
  {
    id: "antihistamine",
    label: "Antihistaminique",
    description: "Le réconforté, qui souffle après l'orage allergique",
    src: "/avatars/antihistamine.png",
  },
  {
    id: "eye-drops",
    label: "Gouttes oculaires",
    description: "Le rafraîchissant, qui apaise les yeux fatigués",
    src: "/avatars/eye-drops.png",
  },
  {
    id: "sunscreen",
    label: "Crème solaire",
    description: "L'estival cool, chapeau de paille en toute saison",
    src: "/avatars/sunscreen.png",
  },

  // ─── Vitamines & énergie ───────────────────────────────────────
  {
    id: "vitamin-c",
    label: "Vitamine C",
    description: "Le rayonnant, qui réveille les matins",
    src: "/avatars/vitamin-c.png",
  },
  {
    id: "vitamin-d",
    label: "Vitamine D",
    description: "Le bronzeur tranquille, qui prend le soleil sans stresser",
    src: "/avatars/vitamin-d.png",
  },
  {
    id: "electrolyte",
    label: "Electrolyte",
    description: "Le coach hydratation, gourde à la main",
    src: "/avatars/electrolyte.png",
  },

  // ─── Soins & topiques ──────────────────────────────────────────
  {
    id: "bandage",
    label: "Bandage",
    description: "Le secouriste, toujours là pour réconforter",
    src: "/avatars/bandage.png",
  },
  {
    id: "antiseptic",
    label: "Antiseptique",
    description: "Le gardien des bobos, bouclier brandi contre les microbes",
    src: "/avatars/antiseptic.png",
  },
  {
    id: "arnica",
    label: "Arnica",
    description: "Le naturel ensoleillé, qui calme les bobos",
    src: "/avatars/arnica.png",
  },

  // ─── Outils & objets pharma ────────────────────────────────────
  {
    id: "prescription",
    label: "Ordonnance",
    description: "Le messager, garant de la dispensation",
    src: "/avatars/prescription.png",
  },
  {
    id: "tensiometre",
    label: "Tensiomètre",
    description: "Le mesureur calme, qui prend le pouls de la pharmacie",
    src: "/avatars/tensiometre.png",
  },
  {
    id: "robot",
    label: "Robot",
    description: "Le précis et infatigable, fierté de l'officine moderne",
    src: "/avatars/robot.png",
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
