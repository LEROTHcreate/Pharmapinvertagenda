/**
 * Store en mémoire — alternative à Prisma quand DEMO_MODE=1.
 * Les données persistent tant que le serveur tourne (perdues au redémarrage).
 */
import {
  EmployeeStatus,
  ScheduleType,
  type AbsenceCode,
  type AbsenceRequestStatus,
  type TaskCode,
  type UserRole,
} from "@prisma/client";
import { pickRoleColor } from "@/lib/role-colors";

// ─── Types miroirs des modèles Prisma ────────────────────────────

export type Pharmacy = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  siret: string | null;
  minStaff: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: number;
  displayColor: string;
  displayOrder: number;
  isActive: boolean;
  hireDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pharmacyId: string;
};

export type UserStatus = "PENDING" | "APPROVED" | "REJECTED";
export type User = {
  id: string;
  email: string;
  hashedPassword: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  isActive: boolean;
  rejectionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  reviewedById: string | null;
  pharmacyId: string;
  employeeId: string | null;
};

export type ScheduleEntry = {
  id: string;
  date: Date;
  timeSlot: string;
  type: ScheduleType;
  taskCode: TaskCode | null;
  absenceCode: AbsenceCode | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  employeeId: string;
  pharmacyId: string;
};

export type AbsenceRequest = {
  id: string;
  dateStart: Date;
  dateEnd: Date;
  absenceCode: AbsenceCode;
  status: AbsenceRequestStatus;
  reason: string | null;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  employeeId: string;
  pharmacyId: string;
};

export class MockStore {
  pharmacies: Pharmacy[] = [];
  employees: Employee[] = [];
  users: User[] = [];
  scheduleEntries: ScheduleEntry[] = [];
  absenceRequests: AbsenceRequest[] = [];
  weekTemplates: unknown[] = [];
  weekTemplateEntries: unknown[] = [];

  constructor() {
    this.seed();
  }

  seed() {
    const now = new Date();
    const pharmacy: Pharmacy = {
      id: "demo-pharmacy",
      name: "Pharmacie du Pin Vert",
      address: "12 avenue du Prado, 13006 Marseille",
      phone: "04 91 00 00 00",
      siret: "12345678900012",
      minStaff: 4,
      createdAt: now,
      updatedAt: now,
    };
    this.pharmacies = [pharmacy];

    const seeds: Array<{
      firstName: string;
      lastName: string;
      status: EmployeeStatus;
      weeklyHours: number;
    }> = [
      { firstName: "Agnès", lastName: "Bertrand", status: EmployeeStatus.TITULAIRE, weeklyHours: 39 },
      { firstName: "Marc", lastName: "Dubois", status: EmployeeStatus.PHARMACIEN, weeklyHours: 35 },
      { firstName: "Claire", lastName: "Lefèvre", status: EmployeeStatus.PHARMACIEN, weeklyHours: 35 },
      { firstName: "Sophie", lastName: "Martin", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
      { firstName: "Julien", lastName: "Garnier", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
      { firstName: "Élodie", lastName: "Robert", status: EmployeeStatus.PREPARATEUR, weeklyHours: 28 },
      { firstName: "Karim", lastName: "Benali", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
      { firstName: "Lucas", lastName: "Petit", status: EmployeeStatus.ETUDIANT, weeklyHours: 14 },
      { firstName: "Emma", lastName: "Roux", status: EmployeeStatus.ETUDIANT, weeklyHours: 14 },
      { firstName: "Patrick", lastName: "Morel", status: EmployeeStatus.LIVREUR, weeklyHours: 30 },
      { firstName: "Nadia", lastName: "Cohen", status: EmployeeStatus.SECRETAIRE, weeklyHours: 35 },
      { firstName: "Camille", lastName: "Faure", status: EmployeeStatus.SECRETAIRE, weeklyHours: 28 },
      { firstName: "Bastien", lastName: "Leroy", status: EmployeeStatus.BACK_OFFICE, weeklyHours: 35 },
      { firstName: "Inès", lastName: "Moreau", status: EmployeeStatus.BACK_OFFICE, weeklyHours: 28 },
      { firstName: "Thomas", lastName: "Bernard", status: EmployeeStatus.PHARMACIEN, weeklyHours: 35 },
      { firstName: "Sarah", lastName: "Klein", status: EmployeeStatus.PREPARATEUR, weeklyHours: 35 },
    ];

    // Couleurs par palette de rôle — chaque collaborateur d'un même statut
    // reçoit une nuance distincte de la même famille (verts pour préparateurs, etc.).
    const roleCounters: Partial<Record<EmployeeStatus, number>> = {};
    this.employees = seeds.map((s, i) => {
      const rank = roleCounters[s.status] ?? 0;
      roleCounters[s.status] = rank + 1;
      return {
        id: `emp-${i + 1}`,
        firstName: s.firstName,
        lastName: s.lastName,
        status: s.status,
        weeklyHours: s.weeklyHours,
        displayColor: pickRoleColor(s.status, rank),
        displayOrder: i,
        isActive: true,
        hireDate: new Date(2020 + (i % 5), (i * 3) % 12, 1 + (i % 28)),
        createdAt: now,
        updatedAt: now,
        pharmacyId: pharmacy.id,
      };
    });

    this.users = [
      {
        id: "user-admin",
        email: "admin@pharmacie-demo.fr",
        hashedPassword: "demo",
        name: "Thorel Nicolas",
        role: "ADMIN",
        status: "APPROVED",
        isActive: true,
        rejectionNote: null,
        createdAt: now,
        updatedAt: now,
        reviewedAt: now,
        reviewedById: null,
        pharmacyId: pharmacy.id,
        // Le programmeur n'est pas dans le planning de l'officine
        employeeId: null,
      },
      {
        id: "user-demo-pending",
        email: "candidat@pharmacie-demo.fr",
        hashedPassword: "demo",
        name: "Jean Candidat",
        role: "EMPLOYEE",
        status: "PENDING",
        isActive: false,
        rejectionNote: null,
        createdAt: new Date(now.getTime() - 86400000),
        updatedAt: now,
        reviewedAt: null,
        reviewedById: null,
        pharmacyId: pharmacy.id,
        employeeId: null,
      },
    ];

    // Génération du planning sur 2 semaines
    const monday = startOfWeekUTC(new Date());
    const days: Date[] = [];
    for (let w = 0; w < 2; w++) {
      for (let d = 0; d < 6; d++) {
        const day = new Date(monday);
        day.setUTCDate(monday.getUTCDate() + w * 7 + d);
        days.push(day);
      }
    }

    const TASK_POOL: Partial<Record<EmployeeStatus, TaskCode[]>> = {
      PHARMACIEN: ["COMPTOIR"],
      TITULAIRE: ["COMPTOIR", "PARAPHARMACIE", "REUNION_FOURNISSEUR"],
      PREPARATEUR: ["COMPTOIR", "PARAPHARMACIE", "MAIL"],
      ETUDIANT: ["COMPTOIR"],
      LIVREUR: ["LIVRAISON"],
      BACK_OFFICE: ["COMMANDE"],
      SECRETAIRE: ["SECRETARIAT", "COMMANDE"],
    };

    const TIME_SLOTS = (() => {
      const slots: string[] = ["07:30"];
      for (let h = 8; h <= 21; h++) {
        slots.push(`${String(h).padStart(2, "0")}:00`);
        slots.push(`${String(h).padStart(2, "0")}:30`);
      }
      return slots;
    })();

    const absencePlan = [
      { idx: 5, week: 0, days: [2, 3], code: "CONGE" as AbsenceCode },
      { idx: 8, week: 1, days: [0, 1, 2, 3, 4, 5], code: "MALADIE" as AbsenceCode },
      { idx: 11, week: 0, days: [4], code: "FORMATION_ABS" as AbsenceCode },
    ];

    let entryId = 1;
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dayOfWeek = i % 6;
      const weekIdx = Math.floor(i / 6);

      this.employees.forEach((emp, empIdx) => {
        const absent = absencePlan.find(
          (a) => a.idx === empIdx && a.week === weekIdx && a.days.includes(dayOfWeek)
        );

        for (const slot of TIME_SLOTS) {
          if (!shouldWork(dayOfWeek, slot, emp.weeklyHours)) continue;

          if (absent) {
            this.scheduleEntries.push({
              id: `se-${entryId++}`,
              date: day,
              timeSlot: slot,
              type: ScheduleType.ABSENCE,
              taskCode: null,
              absenceCode: absent.code,
              notes: null,
              createdAt: now,
              updatedAt: now,
              employeeId: emp.id,
              pharmacyId: pharmacy.id,
            });
            continue;
          }

          const pool = TASK_POOL[emp.status] ?? ["COMPTOIR"];
          let task: TaskCode = pool[0];
          if (slot >= "10:00" && slot < "11:00" && pool.length > 1) task = pool[1];
          else if (slot >= "16:00" && slot < "17:00" && pool.length > 2) task = pool[2];

          this.scheduleEntries.push({
            id: `se-${entryId++}`,
            date: day,
            timeSlot: slot,
            type: ScheduleType.TASK,
            taskCode: task,
            absenceCode: null,
            notes: null,
            createdAt: now,
            updatedAt: now,
            employeeId: emp.id,
            pharmacyId: pharmacy.id,
          });
        }
      });
    }

    // Quelques demandes d'absence
    this.absenceRequests = [
      {
        id: "ar-1",
        pharmacyId: pharmacy.id,
        employeeId: this.employees[6].id,
        dateStart: new Date(monday.getTime() + 14 * 24 * 3600 * 1000),
        dateEnd: new Date(monday.getTime() + 18 * 24 * 3600 * 1000),
        absenceCode: "CONGE",
        status: "PENDING",
        reason: "Vacances en famille",
        adminNote: null,
        createdAt: now,
        updatedAt: now,
        reviewedAt: null,
      },
      {
        id: "ar-2",
        pharmacyId: pharmacy.id,
        employeeId: this.employees[15].id,
        dateStart: new Date(monday.getTime() + 21 * 24 * 3600 * 1000),
        dateEnd: new Date(monday.getTime() + 22 * 24 * 3600 * 1000),
        absenceCode: "FORMATION_ABS",
        status: "APPROVED",
        reason: "Formation produits dermatologiques",
        adminNote: null,
        createdAt: now,
        updatedAt: now,
        reviewedAt: now,
      },
    ];
  }

  newId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function startOfWeekUTC(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

function shouldWork(dayOfWeek: number, slot: string, weeklyHours: number) {
  if (dayOfWeek === 5) return slot >= "08:30" && slot < "13:00";
  if (weeklyHours <= 20 && (dayOfWeek === 1 || dayOfWeek === 3)) return false;
  if (weeklyHours <= 30 && dayOfWeek === 2 && slot >= "12:30") return false;
  if (slot >= "12:30" && slot < "14:00") return false;
  return slot >= "08:30" && slot < "19:30";
}

// Singleton global pour persister entre les requêtes en dev
const globalForStore = globalThis as unknown as { _mockStore?: MockStore };
export const mockStore: MockStore =
  globalForStore._mockStore ?? (globalForStore._mockStore = new MockStore());
