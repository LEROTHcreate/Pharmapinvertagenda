/**
 * Seed PharmaPlanning
 * - 1 pharmacie de démo
 * - 16 employés (multi-statuts)
 * - 2 utilisateurs (admin + employé)
 * - 2 semaines de planning réaliste
 *
 * Lancement : npm run db:seed
 */
import {
  EmployeeStatus,
  PrismaClient,
  ScheduleType,
  type AbsenceCode,
  type TaskCode,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { pickRoleColor } from "../src/lib/role-colors";

const prisma = new PrismaClient();

// ─── Données ─────────────────────────────────────────────────────

type Seedling = {
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: number;
  color: string;
};

// Équipe réelle — issue de l'analyse du fichier Excel "Planning S1 2026"
// Les noms de famille sont des placeholders (à compléter via /employes).
// Les couleurs sont attribuées dynamiquement via pickRoleColor selon la palette du rôle.
const EMPLOYEES: Omit<Seedling, "color">[] = [
  // Titulaires (Lionel travaille S1, Bernard S2 dans la plupart des cas)
  { firstName: "Lionel", lastName: "—", status: EmployeeStatus.TITULAIRE, weeklyHours: 39 },
  { firstName: "Bernard", lastName: "—", status: EmployeeStatus.TITULAIRE, weeklyHours: 35 },
  // Pharmaciens
  { firstName: "Agnès", lastName: "—", status: EmployeeStatus.PHARMACIEN, weeklyHours: 35 },
  { firstName: "Cyril", lastName: "—", status: EmployeeStatus.PHARMACIEN, weeklyHours: 35 },
  { firstName: "Emma", lastName: "—", status: EmployeeStatus.PHARMACIEN, weeklyHours: 35 },
  // Préparateurs : Virginie en tête, puis tri alphabétique
  { firstName: "Virginie", lastName: "—", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
  { firstName: "Aurélie", lastName: "—", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
  { firstName: "Lorena", lastName: "—", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
  { firstName: "Maélys", lastName: "—", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
  { firstName: "Mélanie", lastName: "—", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
  { firstName: "Morgane", lastName: "—", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
  { firstName: "Stéphane", lastName: "—", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
  { firstName: "Stéphanie", lastName: "—", status: EmployeeStatus.PREPARATEUR, weeklyHours: 28 },
  // Étudiants
  { firstName: "Andréa", lastName: "—", status: EmployeeStatus.ETUDIANT, weeklyHours: 14 },
  // Livreur (uniquement après-midi 14:30 → 19:30, Lun-Ven)
  { firstName: "Patrick", lastName: "—", status: EmployeeStatus.LIVREUR, weeklyHours: 25 },
  // Back-office
  { firstName: "Séverine", lastName: "—", status: EmployeeStatus.BACK_OFFICE, weeklyHours: 35 },
  // Secrétaire
  { firstName: "Hassiba", lastName: "—", status: EmployeeStatus.SECRETAIRE, weeklyHours: 35 },
];

// Postes type par statut (utilisés pour le pattern de seed — restent en cohérence avec role-task-rules)
const TASK_POOL: Partial<Record<EmployeeStatus, TaskCode[]>> = {
  PHARMACIEN: ["COMPTOIR"],
  TITULAIRE: ["COMPTOIR", "PARAPHARMACIE", "REUNION_FOURNISSEUR"],
  PREPARATEUR: ["COMPTOIR", "PARAPHARMACIE", "MAIL", "MISE_A_PRIX", "ROBOT"],
  ETUDIANT: ["COMPTOIR"],
  LIVREUR: ["LIVRAISON", "MISE_EN_RAYON", "VERIFICATION_STOCKS"],
  BACK_OFFICE: ["COMMANDE"],
  SECRETAIRE: ["SECRETARIAT", "COMMANDE"],
};

// Créneaux de 30 min de 07:30 à 22:00
const TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let h = 7; h <= 21; h++) {
    if (h === 7) slots.push("07:30");
    else {
      slots.push(`${String(h).padStart(2, "0")}:00`);
      slots.push(`${String(h).padStart(2, "0")}:30`);
    }
  }
  return slots;
})();

/** Numéro de semaine ISO d'une date UTC (1-53) */
function isoWeekNumberUTC(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Lun=0
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

function startOfThisWeekUTC(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=dim
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/**
 * Pattern de présence — la pharmacie est ouverte au public en continu
 * de 08:30 à 20:00 (lunch inclus). Pour ça, deux shifts staggered avec
 * pauses déjeuner décalées :
 *
 *   Groupe A (empIdx pair)  → 08:30-16:30, lunch 12:00-13:00 (7h work)
 *   Groupe B (empIdx impair) → 12:00-20:00, lunch 14:00-15:00 (7h work)
 *
 * Couverture continue 08:30 → 20:00, jamais de "trou" à midi.
 *
 * dayOfWeek : 0=Lundi, 5=Samedi
 * empIdx : index dans le seed (utilisé pour shift + samedi tournant)
 * weekKind : "S1" (impaire) ou "S2" (paire) — alternance des titulaires
 */
function shouldWork(
  empIdx: number,
  status: EmployeeStatus,
  dayOfWeek: number,
  slot: string,
  weeklyHours: number,
  weekKind: "S1" | "S2"
): boolean {
  // ─── Titulaires : Lionel S1 / Bernard S2, journée longue avec lunch décalé ───
  if (status === EmployeeStatus.TITULAIRE) {
    const myWeek: "S1" | "S2" = empIdx % 2 === 0 ? "S1" : "S2";
    if (myWeek !== weekKind) return false;
    if (dayOfWeek === 5) return slot >= "08:30" && slot < "13:00";
    // Lunch : Lionel (idx 0) 12:00-13:00, Bernard (idx 1) 14:00-15:00
    const isLunch =
      (empIdx % 2 === 0 && slot >= "12:00" && slot < "13:00") ||
      (empIdx % 2 === 1 && slot >= "14:00" && slot < "15:00");
    if (isLunch) return false;
    return slot >= "08:30" && slot < "19:00";
  }

  // ─── Livreur : 14:30-19:30 en continu (pas de pause), Lun-Ven ───
  if (status === EmployeeStatus.LIVREUR) {
    if (dayOfWeek === 5) return false;
    return slot >= "14:30" && slot < "19:30";
  }

  // ─── Étudiants : 2 demi-journées (mercredi PM + samedi matin) ───
  if (status === EmployeeStatus.ETUDIANT) {
    if (dayOfWeek === 2) return slot >= "14:00" && slot < "19:00";
    if (dayOfWeek === 5) return slot >= "08:30" && slot < "13:00";
    return false;
  }

  // ─── Samedi matin uniquement, équipes réduites ───
  if (dayOfWeek === 5) {
    if (slot < "08:30" || slot >= "13:00") return false;
    if (status === EmployeeStatus.PHARMACIEN) return empIdx % 2 === 1;
    if (status === EmployeeStatus.PREPARATEUR) return empIdx % 3 === 0;
    return false; // back-office / secrétaire pas le samedi
  }

  // ─── Temps partiels (≤ 30h) : 1 jour off par semaine ───
  if (weeklyHours <= 30) {
    const dayOff = empIdx % 5; // 0..4 (lun..ven)
    if (dayOfWeek === dayOff) return false;
  }

  // ─── Régulier Lun-Ven : 2 shifts staggered ───
  if (empIdx % 2 === 0) {
    // Groupe A : 08:30-16:30 avec lunch 12:00-13:00 (7h)
    if (slot >= "12:00" && slot < "13:00") return false;
    return slot >= "08:30" && slot < "16:30";
  }
  // Groupe B : 12:00-20:00 avec lunch 14:00-15:00 (7h)
  if (slot >= "14:00" && slot < "15:00") return false;
  return slot >= "12:00" && slot < "20:00";
}

function pickTask(status: EmployeeStatus, dayOfWeek: number, slot: string): TaskCode {
  const pool = TASK_POOL[status] ?? ["COMPTOIR"];
  // Livreur : majoritairement LIVRAISON, MISE_EN_RAYON / VERIFICATION_STOCKS
  // entre deux tournées (créneaux "creux" en milieu/fin d'après-midi).
  if (status === EmployeeStatus.LIVREUR) {
    if (slot >= "16:30" && slot < "17:30") return "MISE_EN_RAYON";
    if (slot >= "18:30" && slot < "19:30") return "VERIFICATION_STOCKS";
    return "LIVRAISON";
  }
  // Soirée (18:00-20:00) : poste principal (comptoir / dispensation)
  if (slot >= "18:00") return pool[0];
  // Heuristique : majorité poste principal, varie sur certains créneaux pour la richesse visuelle
  if (slot >= "09:00" && slot < "10:00" && pool.length > 3) return pool[3]; // MISE_A_PRIX (préparateur, back-office)
  if (slot >= "10:00" && slot < "11:00" && pool.length > 1) return pool[1];
  if (slot >= "11:00" && slot < "11:30" && pool.length > 4) return pool[4]; // ROBOT (préparateur)
  if (slot >= "14:00" && slot < "15:00" && dayOfWeek === 1 && pool.length > 2) return pool[2];
  if (slot >= "16:00" && slot < "17:00" && pool.length > 2) return pool[2];
  return pool[0];
}

async function main() {
  console.log("→ Réinitialisation des données...");
  // Nettoyage idempotent (cascades)
  await prisma.scheduleEntry.deleteMany({});
  await prisma.absenceRequest.deleteMany({});
  await prisma.weekTemplateEntry.deleteMany({});
  await prisma.weekTemplate.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.pharmacy.deleteMany({});

  console.log("→ Création de la pharmacie de démo...");
  // ID fixe : permet de re-seeder sans invalider les sessions JWT existantes
  const pharmacy = await prisma.pharmacy.create({
    data: {
      id: "pharmacy-demo-pin-vert",
      name: "Pharmacie du Pin Vert",
      address: "12 avenue du Prado, 13006 Marseille",
      phone: "04 91 00 00 00",
      siret: "12345678900012",
      minStaff: 4,
    },
  });

  console.log("→ Création des employés (couleurs par palette de rôle)...");
  // Compteur par rôle pour que chaque employé d'un même statut
  // reçoive une nuance distincte de la palette de son rôle.
  const roleCounters: Partial<Record<EmployeeStatus, number>> = {};
  const employees = await Promise.all(
    EMPLOYEES.map((e, i) => {
      const rank = roleCounters[e.status] ?? 0;
      roleCounters[e.status] = rank + 1;
      return prisma.employee.create({
        data: {
          pharmacyId: pharmacy.id,
          firstName: e.firstName,
          lastName: e.lastName,
          status: e.status,
          weeklyHours: e.weeklyHours,
          displayColor: pickRoleColor(e.status, rank),
          displayOrder: i,
          hireDate: new Date(2020 + (i % 5), (i * 3) % 12, 1 + (i % 28)),
        },
      });
    })
  );

  console.log("→ Création des comptes utilisateurs...");
  // Les mots de passe ne doivent JAMAIS être hardcodés (Netlify secret scan).
  // En dev, ils sont lus depuis .env (cf. .env.example).
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeMe-admin";
  const employeePassword = process.env.SEED_EMPLOYEE_PASSWORD ?? "changeMe-emp";
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const employeeHash = await bcrypt.hash(employeePassword, 10);

  // IDs fixes pour ces deux comptes démo : les sessions JWT existantes
  // (avec ces IDs en payload) restent valides après un re-seed.
  // L'admin n'est PAS lié à un employé du planning (c'est le programmeur
  // qui gère l'outil, il n'apparaît pas dans la grille).
  await prisma.user.create({
    data: {
      id: "user-demo-admin",
      email: "pharmapinvert.agenda@gmail.com",
      hashedPassword: adminHash,
      name: "Thorel Nicolas",
      role: "ADMIN",
      status: "APPROVED",
      reviewedAt: new Date(),
      pharmacyId: pharmacy.id,
      employeeId: null,
    },
  });
  await prisma.user.create({
    data: {
      id: "user-demo-stephane",
      email: "stephane@pharmacie-demo.fr",
      hashedPassword: employeeHash,
      name: "Stéphane",
      role: "EMPLOYEE",
      status: "APPROVED",
      reviewedAt: new Date(),
      pharmacyId: pharmacy.id,
      employeeId: employees[11].id, // Stéphane (PREPARATEUR, après réordonnancement)
    },
  });

  console.log("→ Génération du planning sur 2 semaines...");
  const monday = startOfThisWeekUTC();
  const days: Date[] = [];
  for (let w = 0; w < 2; w++) {
    for (let d = 0; d < 6; d++) {
      const day = new Date(monday);
      day.setUTCDate(monday.getUTCDate() + w * 7 + d);
      days.push(day);
    }
  }

  const entries: Array<{
    pharmacyId: string;
    employeeId: string;
    date: Date;
    timeSlot: string;
    type: ScheduleType;
    taskCode: TaskCode | null;
    absenceCode: AbsenceCode | null;
  }> = [];

  // Quelques absences planifiées pour le réalisme
  const absencePlan: Array<{ idx: number; week: number; days: number[]; code: AbsenceCode }> = [
    { idx: 5, week: 0, days: [2, 3], code: "CONGE" }, // Élodie : mercredi-jeudi S1
    { idx: 8, week: 1, days: [0, 1, 2, 3, 4, 5], code: "MALADIE" }, // Emma : toute la S2
    { idx: 11, week: 0, days: [4], code: "FORMATION_ABS" }, // Camille : vendredi S1
  ];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const dayOfWeek = i % 6;
    const weekIdx = Math.floor(i / 6);
    // Type de semaine ISO (S1 = impaire, S2 = paire) — pour l'alternance des titulaires
    const isoWeek = isoWeekNumberUTC(day);
    const weekKind: "S1" | "S2" = isoWeek % 2 === 1 ? "S1" : "S2";

    for (const emp of employees) {
      const seedIndex = employees.indexOf(emp);

      // Absence planifiée ?
      const absent = absencePlan.find(
        (a) => a.idx === seedIndex && a.week === weekIdx && a.days.includes(dayOfWeek)
      );

      for (const slot of TIME_SLOTS) {
        if (
          !shouldWork(seedIndex, emp.status, dayOfWeek, slot, emp.weeklyHours, weekKind)
        )
          continue;

        if (absent) {
          entries.push({
            pharmacyId: pharmacy.id,
            employeeId: emp.id,
            date: day,
            timeSlot: slot,
            type: ScheduleType.ABSENCE,
            taskCode: null,
            absenceCode: absent.code,
          });
          continue;
        }

        entries.push({
          pharmacyId: pharmacy.id,
          employeeId: emp.id,
          date: day,
          timeSlot: slot,
          type: ScheduleType.TASK,
          taskCode: pickTask(emp.status, dayOfWeek, slot),
          absenceCode: null,
        });
      }
    }
  }

  // Insertion en chunks pour éviter les timeouts
  const CHUNK = 250;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    await prisma.scheduleEntry.createMany({ data: chunk });
  }

  console.log("→ Création de demandes d'absence...");
  await prisma.absenceRequest.createMany({
    data: [
      {
        pharmacyId: pharmacy.id,
        employeeId: employees[6].id,
        dateStart: new Date(monday.getTime() + 14 * 24 * 3600 * 1000),
        dateEnd: new Date(monday.getTime() + 18 * 24 * 3600 * 1000),
        absenceCode: "CONGE",
        status: "PENDING",
        reason: "Vacances en famille",
      },
      {
        pharmacyId: pharmacy.id,
        employeeId: employees[15].id,
        dateStart: new Date(monday.getTime() + 21 * 24 * 3600 * 1000),
        dateEnd: new Date(monday.getTime() + 22 * 24 * 3600 * 1000),
        absenceCode: "FORMATION_ABS",
        status: "APPROVED",
        reason: "Formation produits dermatologiques",
        reviewedAt: new Date(),
      },
    ],
  });

  console.log(
    `✓ Seed terminé : ${employees.length} employés, ${entries.length} créneaux planning`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
