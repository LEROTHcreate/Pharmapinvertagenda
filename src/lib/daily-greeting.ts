/**
 * Phrases du jour affichées dans le bandeau "Bonjour [prénom]" au-dessus
 * du planning. Le tirage est déterministe sur (userId, date) pour qu'un même
 * utilisateur voie la même phrase toute la journée — pas de flicker au refresh
 * mais une nouvelle phrase chaque matin.
 *
 * Filtre par jour de semaine : les phrases "weekday-only" n'apparaissent que
 * le jour correspondant, les autres sont dans le pool générique.
 */

export type DailyGreeting = {
  text: string;
  /** 1=lundi, 2=mardi, …, 6=samedi. Si absent : pool générique. */
  weekday?: 1 | 2 | 3 | 4 | 5 | 6;
};

const GREETINGS: DailyGreeting[] = [
  // ─── Officine — humour de comptoir ─────────────────────────────
  { text: "Un patient qui éternue trois fois c'est un patient. À la quatrième, c'est le frigo qui démarre." },
  { text: "Le métier de pharmacien : 30 % chimie, 70 % psychologie." },
  { text: "Une boîte de Doliprane traverse le comptoir toutes les 4 minutes. C'est presque romantique." },
  { text: "Le robot de dispensation : silencieux, fiable, jamais en retard. Inspirons-nous." },
  { text: "Le préparateur connaît mieux le patient que son médecin. Ne lui dites pas." },
  { text: "Les commandes du matin sentent le carton et la promesse." },
  { text: "Aujourd'hui un client va dire « c'est urgent » — sourire en retour, antidote universel." },
  { text: "Si quelqu'un demande « vous avez ça en moins fort ? », proposez un câlin." },

  // ─── Saviez-vous (faits curieux) ───────────────────────────────
  { text: "Les abeilles reconnaissent les visages humains. Soyez aimable, on ne sait jamais." },
  { text: "Les pieuvres ont 3 cœurs et 9 cerveaux. Vous gérez avec moins, chapeau." },
  { text: "Un câlin de 20 secondes libère autant d'ocytocine qu'une victoire professionnelle." },
  { text: "Les flamants roses dorment sur une seule patte. Vous, faites les deux, c'est plus prudent." },
  { text: "Le mot « pharmacie » vient du grec pharmakon : à la fois remède et poison. Tout est question de dose." },
  { text: "La caféine met 45 minutes à atteindre son pic. Programmez votre café avant les patients." },
  { text: "Sourire utilise 17 muscles. Faire la tête en utilise 43. Optimisez." },
  { text: "Il pleut chaque jour quelque part sur Terre. Si c'est ici, ce n'est pas personnel." },

  // ─── Encouragement / feel-good ─────────────────────────────────
  { text: "Vous serez peut-être la première personne souriante que certains croiseront aujourd'hui." },
  { text: "Quelqu'un va guérir grâce à vos conseils. Pas mal pour un mardi." },
  { text: "Une bonne journée commence par un verre d'eau et finit par un autre." },
  { text: "Un compliment offert en passant illumine une matinée entière." },
  { text: "La meilleure réponse à « ça va ? » c'est un sourire qui dit oui." },
  { text: "Respirer profondément n'a jamais aggravé une situation." },
  { text: "Le calme est contagieux. Soyez patient zéro." },
  { text: "Aujourd'hui est statistiquement un bon jour pour rire au moins une fois." },

  // ─── Petites pépites quotidiennes ──────────────────────────────
  { text: "Vérifiez que vos chaussettes sont assorties. Si oui, c'est déjà une victoire." },
  { text: "Un café partagé vaut deux cafés solitaires. Pensez-y." },
  { text: "Si tout va bien, votre badge est dans la bonne poche." },
  { text: "Hier est en BDD, demain est en cache, profitez d'aujourd'hui." },
  { text: "Le saviez-vous ? Personne ne se souvient des mots de passe. Tout le monde fait semblant." },
  { text: "Aujourd'hui, ne pas dire « y'a plus de stock » 5 fois d'affilée : un mini-défi." },
  { text: "La semaine est comme une pile : ça démarre fort, et ça mollit côté vendredi." },
  { text: "Buvez un verre d'eau, le futur vous remerciera." },

  // ─── Spécifiques jours de la semaine ───────────────────────────
  { text: "Lundi, c'est juste un dimanche déguisé en obligation.", weekday: 1 },
  { text: "Mardi paraît court quand on l'attaque comme un vendredi.", weekday: 2 },
  { text: "Mercredi, sommet de la semaine. La pente descend après.", weekday: 3 },
  { text: "Jeudi : dernier jour avant qu'on dise « plus qu'un jour ».", weekday: 4 },
  { text: "Vendredi sourit même sous la pluie.", weekday: 5 },
  { text: "Samedi, l'officine vit sa meilleure vie.", weekday: 6 },
  { text: "Le saviez-vous ? Le samedi a 24 heures comme les autres. C'est suspect.", weekday: 6 },
  { text: "Vendredi : la semaine sourit et tend la main vers le week-end.", weekday: 5 },
];

/**
 * Renvoie une phrase aléatoire — change à chaque appel (donc à chaque refresh).
 *  - `dateIso` : date du jour (YYYY-MM-DD) pour filtrer les phrases qui ne
 *    s'appliquent qu'à un certain jour de la semaine.
 */
export function pickRandomGreeting(dateIso?: string): string {
  const day = dateIso
    ? new Date(`${dateIso}T00:00:00Z`).getUTCDay() // 0=dim, 1=lun…6=sam
    : new Date().getDay();
  // On garde uniquement les phrases génériques + celles du jour de la semaine
  const pool = GREETINGS.filter(
    (g) => g.weekday === undefined || g.weekday === day
  );
  if (pool.length === 0) return "Belle journée à vous.";
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx].text;
}

/** Salutation contextuelle selon l'heure (matin / aprem / soir). */
export function timeBasedHello(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}
