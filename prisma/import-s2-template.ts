/**
 * Import du gabarit S2 — basé sur les captures d'écran de l'Excel
 * "Planning S2" (semaine du 9 fév 26 → 14 fév 26).
 *
 * Lancement : npx tsx prisma/import-s2-template.ts
 *
 * Différences clés vs S1 :
 *  - Aurélie en CONGÉ toute la semaine (5 jours)
 *  - Bernard (titulaire S2) prend la place de Lionel comme titulaire actif
 *  - Cyril plus présent (visible avec bandes Cptoir tous les jours)
 *  - Reste : patterns proches de S1 avec quelques variations
 */
import { PrismaClient, ScheduleType, type AbsenceCode, type TaskCode } from "@prisma/client";

const prisma = new PrismaClient();

const TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let h = 8; h <= 20; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 20) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  slots.unshift("08:30");
  return Array.from(new Set(slots)).sort();
})();

type Block =
  | { from: string; to: string; task: TaskCode }
  | { from: string; to: string; absence: AbsenceCode };
type DayPlan = Block[];
type WeekPlan = Partial<Record<0 | 1 | 2 | 3 | 4 | 5, DayPlan>>;

function expandBlock(block: Block): { slot: string; entry: Block }[] {
  return TIME_SLOTS.filter((s) => s >= block.from && s < block.to).map((slot) => ({
    slot,
    entry: block,
  }));
}

/* ─── Patterns réutilisables ───────────────────────────────────── */

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

const MORNING_C: DayPlan = [
  { from: "08:30", to: "12:00", task: "COMPTOIR" },
  { from: "13:00", to: "16:30", task: "COMPTOIR" },
];
const AFTERNOON_C: DayPlan = [
  { from: "12:00", to: "14:00", task: "COMPTOIR" },
  { from: "15:00", to: "20:00", task: "COMPTOIR" },
];

const LIVREUR_PM: DayPlan = [
  { from: "14:30", to: "16:30", task: "LIVRAISON" },
  { from: "16:30", to: "17:30", task: "MISE_EN_RAYON" },
  { from: "17:30", to: "18:30", task: "LIVRAISON" },
  { from: "18:30", to: "19:30", task: "VERIFICATION_STOCKS" },
];

const ETUDIANT_MER: DayPlan = [{ from: "14:00", to: "19:00", task: "COMPTOIR" }];
const ETUDIANT_SAM: DayPlan = [{ from: "08:30", to: "13:00", task: "COMPTOIR" }];

const TITULAIRE_FULL: DayPlan = [
  { from: "08:30", to: "12:30", task: "COMPTOIR" },
  { from: "14:00", to: "19:00", task: "COMPTOIR" },
];
const TITULAIRE_SAM: DayPlan = [
  { from: "08:30", to: "13:00", task: "COMPTOIR" },
];

const PHARM_CPTOIR: DayPlan = [
  { from: "09:00", to: "12:30", task: "COMPTOIR" },
  { from: "14:00", to: "19:00", task: "COMPTOIR" },
];

const PHARM_HSUP: DayPlan = [
  { from: "09:00", to: "10:00", task: "COMPTOIR" },
  { from: "10:00", to: "12:00", task: "HEURES_SUP" },
  { from: "12:00", to: "12:30", task: "COMPTOIR" },
  { from: "14:00", to: "15:00", task: "COMPTOIR" },
  { from: "15:00", to: "16:00", task: "HEURES_SUP" },
  { from: "16:00", to: "19:00", task: "COMPTOIR" },
];

// Aurélie : CONGÉ toute la semaine (5 jours, samedi naturellement off)
const CONGE_FULL_DAY: DayPlan = [
  { from: "08:30", to: "19:30", absence: "CONGE" },
];

/* ─── Plan complet par collaborateur ─────────────────────────────── */

const PLAN: Record<string, WeekPlan> = {
  // Pharmaciens
  "Agnès": {
    0: PHARM_HSUP,
    1: PHARM_CPTOIR,
    2: PHARM_CPTOIR,
    3: [
      { from: "09:00", to: "10:00", task: "HEURES_SUP" },
      { from: "10:00", to: "12:30", task: "COMPTOIR" },
      { from: "14:00", to: "15:00", task: "HEURES_SUP" },
      { from: "15:00", to: "19:00", task: "COMPTOIR" },
    ],
    4: PHARM_CPTOIR,
  },
  // Cyril : très présent en S2 (visible Cptoir tous les jours dans l'Excel)
  "Cyril": {
    0: PHARM_CPTOIR,
    1: PHARM_CPTOIR,
    2: PHARM_CPTOIR,
    3: PHARM_CPTOIR,
    4: PHARM_CPTOIR,
    5: TITULAIRE_SAM,
  },
  "Emma": {
    0: [
      { from: "14:00", to: "16:00", task: "COMPTOIR" },
      { from: "16:00", to: "17:00", task: "HEURES_SUP" },
      { from: "17:00", to: "19:00", task: "COMPTOIR" },
    ],
    1: PHARM_CPTOIR,
    2: PHARM_CPTOIR,
    3: PHARM_CPTOIR,
    4: PHARM_CPTOIR,
  },

  // Aurélie en CONGÉ toute la semaine S2
  "Aurélie": {
    0: CONGE_FULL_DAY,
    1: CONGE_FULL_DAY,
    2: CONGE_FULL_DAY,
    3: CONGE_FULL_DAY,
    4: CONGE_FULL_DAY,
    5: CONGE_FULL_DAY,
  },

  // Virginie (ex-Franco) : COMPTOIR matin (groupe matin)
  "Virginie": {
    0: MORNING_C,
    1: MORNING_C,
    2: [
      { from: "08:30", to: "12:00", task: "PARAPHARMACIE" },
      { from: "13:00", to: "16:30", task: "PARAPHARMACIE" },
    ],
    3: MORNING_C,
    4: MORNING_C,
  },

  // Maélys : Para toute la semaine (visible "Para" partout dans l'Excel)
  "Maélys": {
    0: FULL_PARA,
    1: FULL_PARA,
    2: FULL_PARA,
    3: FULL_PARA,
    4: FULL_PARA,
    5: ETUDIANT_SAM,
  },

  // Lorena : COMPTOIR avec quelques jours à pattern variant
  "Lorena": {
    0: AFTERNOON_C,
    1: AFTERNOON_C,
    2: AFTERNOON_C,
    3: AFTERNOON_C,
    4: AFTERNOON_C,
  },

  // Mélanie : M/A/P toute la semaine
  "Mélanie": {
    0: FULL_MAP,
    1: FULL_MAP,
    2: FULL_MAP,
    3: FULL_MAP,
    4: FULL_MAP,
  },

  // Morgane : pattern matin standard
  "Morgane": {
    0: MORNING_C,
    1: MORNING_C,
    2: MORNING_C,
    3: MORNING_C,
    4: MORNING_C,
  },

  // Stéphane : pattern après-midi
  "Stéphane": {
    0: AFTERNOON_C,
    1: AFTERNOON_C,
    3: AFTERNOON_C,
    4: AFTERNOON_C,
  },

  // Stéphanie (28h) : 4 jours / semaine
  "Stéphanie": {
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

  // Étudiante
  "Andréa": {
    2: ETUDIANT_MER,
    5: ETUDIANT_SAM,
  },

  // Livreur
  "Patrick": {
    0: LIVREUR_PM,
    1: LIVREUR_PM,
    2: LIVREUR_PM,
    3: LIVREUR_PM,
    4: LIVREUR_PM,
  },

  // Back-office
  "Séverine": {
    0: FULL_COMMANDE,
    1: FULL_COMMANDE,
    2: FULL_COMMANDE,
    3: FULL_COMMANDE,
    4: FULL_COMMANDE,
  },

  // Secrétaire
  "Hassiba": {
    0: FULL_SECRETARIAT,
    1: FULL_SECRETARIAT,
    2: FULL_SECRETARIAT,
    3: FULL_SECRETARIAT,
    4: FULL_SECRETARIAT,
  },

  // ─── Bernard (titulaire S2) ─── prend la place de Lionel
  "Bernard": {
    0: TITULAIRE_FULL,
    1: TITULAIRE_FULL,
    2: TITULAIRE_FULL,
    3: TITULAIRE_FULL,
    4: TITULAIRE_FULL,
    5: TITULAIRE_SAM,
  },

  // Lionel (titulaire S1) absent en S2 → pas de plan
};

/* ─── Exécution ───────────────────────────────────────────────── */

async function main() {
  const pharmacy = await prisma.pharmacy.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!pharmacy) {
    throw new Error("Aucune pharmacie en base. Lance `npm run db:seed` d'abord.");
  }
  console.log(`→ Pharmacie : ${pharmacy.name}`);

  const employees = await prisma.employee.findMany({
    where: { pharmacyId: pharmacy.id, isActive: true },
    select: { id: true, firstName: true, status: true },
  });
  const empByName = new Map(employees.map((e) => [e.firstName, e]));

  // Supprime les gabarits S2 existants pour repartir propre
  const existingS2 = await prisma.weekTemplate.findMany({
    where: { pharmacyId: pharmacy.id, weekType: "S2" },
    select: { id: true },
  });
  if (existingS2.length > 0) {
    console.log(`→ Suppression ${existingS2.length} ancien(s) gabarit(s) S2...`);
    await prisma.weekTemplate.deleteMany({
      where: { id: { in: existingS2.map((t) => t.id) } },
    });
  }

  const tpl = await prisma.weekTemplate.create({
    data: {
      pharmacyId: pharmacy.id,
      weekType: "S2",
      name: "S2 — Standard (depuis Excel)",
    },
  });
  console.log(`→ Gabarit créé : ${tpl.name}`);

  const entriesData: Array<{
    templateId: string;
    employeeId: string;
    dayOfWeek: number;
    timeSlot: string;
    type: ScheduleType;
    taskCode: TaskCode | null;
    absenceCode: AbsenceCode | null;
  }> = [];

  let skippedMissing = 0;
  for (const [name, week] of Object.entries(PLAN)) {
    const emp = empByName.get(name);
    if (!emp) {
      console.warn(`  ⚠ Collaborateur "${name}" introuvable — ignoré`);
      skippedMissing++;
      continue;
    }
    for (const [dayStr, dayPlan] of Object.entries(week)) {
      const dayOfWeek = Number(dayStr);
      for (const block of dayPlan as DayPlan) {
        for (const { slot, entry } of expandBlock(block)) {
          if ("task" in entry) {
            entriesData.push({
              templateId: tpl.id,
              employeeId: emp.id,
              dayOfWeek,
              timeSlot: slot,
              type: ScheduleType.TASK,
              taskCode: entry.task,
              absenceCode: null,
            });
          } else {
            entriesData.push({
              templateId: tpl.id,
              employeeId: emp.id,
              dayOfWeek,
              timeSlot: slot,
              type: ScheduleType.ABSENCE,
              taskCode: null,
              absenceCode: entry.absence,
            });
          }
        }
      }
    }
  }

  const CHUNK = 250;
  for (let i = 0; i < entriesData.length; i += CHUNK) {
    await prisma.weekTemplateEntry.createMany({
      data: entriesData.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }

  console.log(
    `✓ ${entriesData.length} entrées créées dans le gabarit S2${
      skippedMissing > 0 ? ` (${skippedMissing} ignorés)` : ""
    }`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
