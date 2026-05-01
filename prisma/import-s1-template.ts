/**
 * Import du gabarit S1 — basé sur les captures d'écran de l'Excel "Planning S1 2026".
 *
 * Lancement : npx tsx prisma/import-s1-template.ts
 *
 * Logique : pour chaque collaborateur on définit, jour par jour, une
 * séquence de blocs `{ from, to, task }`. Chaque bloc remplit toutes les
 * tranches de 30 min entre `from` (inclus) et `to` (exclu). Si une journée
 * n'est pas définie pour un collaborateur, il est OFF ce jour-là.
 *
 * Le script remplace tout gabarit S1 existant pour la pharmacie.
 */
import { PrismaClient, ScheduleType, type TaskCode } from "@prisma/client";

const prisma = new PrismaClient();

const TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let h = 8; h <= 20; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 20) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  // Ajoute 08:30 que la boucle ne couvre pas en début
  slots.unshift("08:30");
  return Array.from(new Set(slots)).sort();
})();

type Block = { from: string; to: string; task: TaskCode };
type DayPlan = Block[];
type WeekPlan = Partial<Record<0 | 1 | 2 | 3 | 4 | 5, DayPlan>>;

/* ─── Helpers ──────────────────────────────────────────────────── */

/** Toutes les tranches de 30 min strictement comprises dans [from, to). */
function expandBlock(block: Block): { slot: string; task: TaskCode }[] {
  return TIME_SLOTS.filter((s) => s >= block.from && s < block.to).map((slot) => ({
    slot,
    task: block.task,
  }));
}

/** Standard : journée matin + après-midi avec lunch décalé. */
const C = (m: TaskCode = "COMPTOIR") => m;

/* ─── Patterns réutilisables ───────────────────────────────────── */

// Préparatrice "groupe matin" : 08:30-16:30 avec pause 12:00-13:00
const MORNING_C: DayPlan = [
  { from: "08:30", to: "12:00", task: "COMPTOIR" },
  { from: "13:00", to: "16:30", task: "COMPTOIR" },
];
const MORNING_C_PARA_PM: DayPlan = [
  { from: "08:30", to: "12:00", task: "COMPTOIR" },
  { from: "13:00", to: "16:30", task: "PARAPHARMACIE" },
];

// Préparatrice "groupe après-midi" : 12:00-20:00 avec pause 14:00-15:00
const AFTERNOON_C: DayPlan = [
  { from: "12:00", to: "14:00", task: "COMPTOIR" },
  { from: "15:00", to: "20:00", task: "COMPTOIR" },
];

const FULL_PARA: DayPlan = [
  { from: "08:30", to: "12:00", task: "PARAPHARMACIE" },
  { from: "13:00", to: "19:00", task: "PARAPHARMACIE" },
];

const FULL_MAP: DayPlan = [
  { from: "08:30", to: "12:00", task: "MISE_A_PRIX" },
  { from: "13:00", to: "19:00", task: "MISE_A_PRIX" },
];

const FULL_COMMANDE: DayPlan = [
  { from: "08:30", to: "12:00", task: "COMMANDE" },
  { from: "13:00", to: "17:00", task: "COMMANDE" },
];

const FULL_SECRETARIAT: DayPlan = [
  { from: "08:30", to: "12:00", task: "SECRETARIAT" },
  { from: "14:00", to: "17:00", task: "SECRETARIAT" },
];

// Patrick (livreur) : 14:30-19:30 LIVRAISON, alterné MISE_EN_RAYON et VERIF
const LIVREUR_PM: DayPlan = [
  { from: "14:30", to: "16:30", task: "LIVRAISON" },
  { from: "16:30", to: "17:30", task: "MISE_EN_RAYON" },
  { from: "17:30", to: "18:30", task: "LIVRAISON" },
  { from: "18:30", to: "19:30", task: "VERIFICATION_STOCKS" },
];

// Andréa (étudiante) : mer après-midi + samedi matin
const ETUDIANT_MER: DayPlan = [
  { from: "14:00", to: "19:00", task: "COMPTOIR" },
];
const ETUDIANT_SAM: DayPlan = [
  { from: "08:30", to: "13:00", task: "COMPTOIR" },
];

// Pharmaciens : Cptoir avec H Sup ponctuel comme dans l'Excel
const PHARM_CPTOIR_HSUP: DayPlan = [
  { from: "09:00", to: "10:00", task: "COMPTOIR" },
  { from: "10:00", to: "12:00", task: "HEURES_SUP" },
  { from: "12:00", to: "12:30", task: "COMPTOIR" },
  { from: "14:00", to: "15:00", task: "COMPTOIR" },
  { from: "15:00", to: "16:00", task: "HEURES_SUP" },
  { from: "16:00", to: "19:00", task: "COMPTOIR" },
];

const PHARM_CPTOIR: DayPlan = [
  { from: "09:00", to: "12:30", task: "COMPTOIR" },
  { from: "14:00", to: "19:00", task: "COMPTOIR" },
];

// Lionel (titulaire S1) : Cptoir toute la semaine
const TITULAIRE_FULL: DayPlan = [
  { from: "08:30", to: "12:30", task: "COMPTOIR" },
  { from: "14:00", to: "19:00", task: "COMPTOIR" },
];
const TITULAIRE_SAM: DayPlan = [
  { from: "08:30", to: "13:00", task: "COMPTOIR" },
];

/* ─── Plan complet par collaborateur ─────────────────────────────── */
// Note : 0=Lun, 1=Mar, 2=Mer, 3=Jeu, 4=Ven, 5=Sam
// Bernard (titulaire S2) absent du gabarit S1.

const PLAN: Record<string, WeekPlan> = {
  // Pharmaciens
  "Agnès": {
    0: PHARM_CPTOIR_HSUP,
    1: PHARM_CPTOIR_HSUP,
    2: PHARM_CPTOIR,
    3: [
      { from: "08:30", to: "09:30", task: "FORMATION" },
      { from: "09:30", to: "12:30", task: "COMPTOIR" },
      { from: "14:00", to: "19:00", task: "COMPTOIR" },
    ],
    4: PHARM_CPTOIR_HSUP,
  },
  "Cyril": {
    1: PHARM_CPTOIR,
    3: PHARM_CPTOIR,
    4: PHARM_CPTOIR,
    5: TITULAIRE_SAM, // Cyril fait le samedi (rotation pharmacien)
  },
  "Emma": {
    2: PHARM_CPTOIR,
    3: [
      { from: "09:00", to: "10:00", task: "MISE_A_PRIX" },
      { from: "10:00", to: "12:30", task: "COMPTOIR" },
      { from: "14:00", to: "19:00", task: "COMPTOIR" },
    ],
  },

  // Préparatrices — pattern "matin" majoritaire avec PARA / M-A-P selon les jours
  // (cf. Excel : Aurélie-Para, Maélys-Para alternant Cptoir, Mélanie-M/A/P, etc.)
  "Aurélie": {
    0: [
      { from: "09:00", to: "10:00", task: "HEURES_SUP" },
      { from: "10:00", to: "12:30", task: "COMPTOIR" },
      { from: "14:00", to: "17:00", task: "PARAPHARMACIE" },
    ],
    1: MORNING_C_PARA_PM,
    2: MORNING_C_PARA_PM,
    3: [
      { from: "09:00", to: "10:00", task: "MISE_A_PRIX" },
      { from: "10:00", to: "12:30", task: "COMPTOIR" },
      { from: "14:00", to: "17:00", task: "PARAPHARMACIE" },
    ],
    4: MORNING_C_PARA_PM,
  },
  "Virginie": {
    // (était "Franco" dans l'Excel)
    0: AFTERNOON_C,
    2: [
      { from: "08:30", to: "12:30", task: "PARAPHARMACIE" },
      { from: "13:00", to: "19:00", task: "PARAPHARMACIE" },
    ],
    3: AFTERNOON_C,
    4: AFTERNOON_C,
  },
  "Maélys": {
    0: FULL_PARA,
    1: FULL_PARA,
    2: FULL_PARA,
    3: [
      { from: "08:30", to: "12:00", task: "PARAPHARMACIE" },
      { from: "13:00", to: "16:30", task: "PARAPHARMACIE" },
    ],
    4: FULL_PARA,
    5: ETUDIANT_SAM, // samedi matin tournant — préparatrice pair idx
  },
  "Lorena": {
    0: AFTERNOON_C,
    1: AFTERNOON_C,
    2: AFTERNOON_C,
    3: AFTERNOON_C,
    4: AFTERNOON_C,
  },
  "Mélanie": {
    0: FULL_MAP,
    1: FULL_MAP,
    2: [
      { from: "08:30", to: "12:00", task: "MISE_A_PRIX" },
      { from: "13:00", to: "16:30", task: "MISE_A_PRIX" },
    ],
    3: FULL_MAP,
    4: FULL_MAP,
  },
  "Morgane": {
    // Pas explicite dans l'Excel — pattern matin standard
    0: MORNING_C,
    1: MORNING_C,
    2: MORNING_C,
    3: MORNING_C,
    4: MORNING_C,
  },
  "Stéphane": {
    // Pas explicite dans l'Excel — pattern après-midi standard
    0: AFTERNOON_C,
    1: AFTERNOON_C,
    3: AFTERNOON_C,
    4: AFTERNOON_C,
  },
  "Stéphanie": {
    // 28h — temps partiel ; pattern réduit
    0: [
      { from: "08:30", to: "12:00", task: "COMPTOIR" },
      { from: "13:00", to: "16:30", task: "COMPTOIR" },
    ],
    1: [
      { from: "08:30", to: "12:00", task: "COMPTOIR" },
      { from: "13:00", to: "16:30", task: "COMPTOIR" },
    ],
    3: [
      { from: "08:30", to: "12:00", task: "COMPTOIR" },
      { from: "13:00", to: "16:30", task: "COMPTOIR" },
    ],
    4: [
      { from: "08:30", to: "12:00", task: "COMPTOIR" },
      { from: "13:00", to: "16:30", task: "COMPTOIR" },
    ],
  },

  // Étudiante : 2 demi-journées
  "Andréa": {
    2: ETUDIANT_MER,
    5: ETUDIANT_SAM,
  },

  // Livreur : Lun-Ven après-midi
  "Patrick": {
    0: LIVREUR_PM,
    1: LIVREUR_PM,
    2: LIVREUR_PM,
    3: LIVREUR_PM,
    4: LIVREUR_PM,
  },

  // Back-office : 5 jours / semaine
  "Séverine": {
    0: FULL_COMMANDE,
    1: FULL_COMMANDE,
    2: FULL_COMMANDE,
    3: FULL_COMMANDE,
    4: FULL_COMMANDE,
  },

  // Secrétaire : 5 jours / semaine
  "Hassiba": {
    0: FULL_SECRETARIAT,
    1: FULL_SECRETARIAT,
    2: FULL_SECRETARIAT,
    3: FULL_SECRETARIAT,
    4: FULL_SECRETARIAT,
  },

  // Lionel (titulaire S1) : présent toute la semaine S1
  "Lionel": {
    0: TITULAIRE_FULL,
    1: TITULAIRE_FULL,
    2: TITULAIRE_FULL,
    3: [
      { from: "08:30", to: "12:30", task: "COMPTOIR" },
      { from: "14:00", to: "15:00", task: "HEURES_SUP" },
      { from: "15:00", to: "19:00", task: "COMPTOIR" },
    ],
    4: TITULAIRE_FULL,
    5: TITULAIRE_SAM,
  },
};

void C; // silence unused

/* ─── Exécution ───────────────────────────────────────────────── */

async function main() {
  // Une seule pharmacie en mode mono-tenant pour le moment.
  const pharmacy = await prisma.pharmacy.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!pharmacy) {
    throw new Error("Aucune pharmacie en base. Lance `npm run db:seed` d'abord.");
  }
  console.log(`→ Pharmacie : ${pharmacy.name} (${pharmacy.id})`);

  const employees = await prisma.employee.findMany({
    where: { pharmacyId: pharmacy.id, isActive: true },
    select: { id: true, firstName: true, status: true },
  });
  const empByName = new Map(employees.map((e) => [e.firstName, e]));

  // Supprime les gabarits S1 existants pour repartir propre.
  const existingS1 = await prisma.weekTemplate.findMany({
    where: { pharmacyId: pharmacy.id, weekType: "S1" },
    select: { id: true, name: true },
  });
  if (existingS1.length > 0) {
    console.log(`→ Suppression ${existingS1.length} ancien(s) gabarit(s) S1...`);
    await prisma.weekTemplate.deleteMany({
      where: { id: { in: existingS1.map((t) => t.id) } },
    });
  }

  // Crée le nouveau gabarit
  const tpl = await prisma.weekTemplate.create({
    data: {
      pharmacyId: pharmacy.id,
      weekType: "S1",
      name: "S1 — Standard (depuis Excel)",
    },
  });
  console.log(`→ Gabarit créé : ${tpl.name} (${tpl.id})`);

  // Génère les entrées
  const entriesData: Array<{
    templateId: string;
    employeeId: string;
    dayOfWeek: number;
    timeSlot: string;
    type: ScheduleType;
    taskCode: TaskCode | null;
    absenceCode: null;
  }> = [];

  let skippedMissing = 0;
  for (const [name, week] of Object.entries(PLAN)) {
    const emp = empByName.get(name);
    if (!emp) {
      console.warn(`  ⚠ Collaborateur "${name}" introuvable dans la BDD — ignoré`);
      skippedMissing++;
      continue;
    }
    for (const [dayStr, dayPlan] of Object.entries(week)) {
      const dayOfWeek = Number(dayStr);
      for (const block of dayPlan as DayPlan) {
        for (const { slot, task } of expandBlock(block)) {
          entriesData.push({
            templateId: tpl.id,
            employeeId: emp.id,
            dayOfWeek,
            timeSlot: slot,
            type: ScheduleType.TASK,
            taskCode: task,
            absenceCode: null,
          });
        }
      }
    }
  }

  // Insertion en chunk pour éviter les timeouts
  const CHUNK = 250;
  for (let i = 0; i < entriesData.length; i += CHUNK) {
    await prisma.weekTemplateEntry.createMany({
      data: entriesData.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }

  console.log(
    `✓ ${entriesData.length} entrées créées dans le gabarit S1${
      skippedMissing > 0 ? ` (${skippedMissing} collaborateurs ignorés)` : ""
    }`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
