import { ScheduleType, type EmployeeStatus, type TaskCode, type AbsenceCode } from "@prisma/client";
import { PlanningView } from "@/components/planning/PlanningView";
import { startOfWeek, toIsoDate, weekDays } from "@/lib/planning-utils";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";

export const metadata = { title: "Démo · PharmaPlanning" };
export const dynamic = "force-dynamic";

// Données factices pour visualiser le planning sans BDD
const MOCK_EMPLOYEES: EmployeeDTO[] = [
  { id: "e1", firstName: "Agnès", lastName: "Bertrand", status: "TITULAIRE" as EmployeeStatus, weeklyHours: 39, displayColor: "#7c3aed", displayOrder: 0 },
  { id: "e2", firstName: "Marc", lastName: "Dubois", status: "PHARMACIEN", weeklyHours: 35, displayColor: "#2563eb", displayOrder: 1 },
  { id: "e3", firstName: "Claire", lastName: "Lefèvre", status: "PHARMACIEN", weeklyHours: 35, displayColor: "#0ea5e9", displayOrder: 2 },
  { id: "e4", firstName: "Sophie", lastName: "Martin", status: "PREPARATEUR", weeklyHours: 35, displayColor: "#10b981", displayOrder: 3 },
  { id: "e5", firstName: "Julien", lastName: "Garnier", status: "PREPARATEUR", weeklyHours: 35, displayColor: "#059669", displayOrder: 4 },
  { id: "e6", firstName: "Élodie", lastName: "Robert", status: "PREPARATEUR", weeklyHours: 28, displayColor: "#14b8a6", displayOrder: 5 },
  { id: "e7", firstName: "Karim", lastName: "Benali", status: "PREPARATEUR", weeklyHours: 35, displayColor: "#06b6d4", displayOrder: 6 },
  { id: "e8", firstName: "Lucas", lastName: "Petit", status: "ETUDIANT", weeklyHours: 14, displayColor: "#f59e0b", displayOrder: 7 },
  { id: "e9", firstName: "Emma", lastName: "Roux", status: "ETUDIANT", weeklyHours: 14, displayColor: "#f97316", displayOrder: 8 },
  { id: "e10", firstName: "Patrick", lastName: "Morel", status: "LIVREUR", weeklyHours: 30, displayColor: "#84cc16", displayOrder: 9 },
  { id: "e11", firstName: "Nadia", lastName: "Cohen", status: "SECRETAIRE", weeklyHours: 35, displayColor: "#ec4899", displayOrder: 10 },
  { id: "e12", firstName: "Camille", lastName: "Faure", status: "SECRETAIRE", weeklyHours: 28, displayColor: "#d946ef", displayOrder: 11 },
  { id: "e13", firstName: "Bastien", lastName: "Leroy", status: "BACK_OFFICE", weeklyHours: 35, displayColor: "#a855f7", displayOrder: 12 },
  { id: "e14", firstName: "Inès", lastName: "Moreau", status: "BACK_OFFICE", weeklyHours: 28, displayColor: "#9333ea", displayOrder: 13 },
];

const TIME_SLOTS = (() => {
  const slots: string[] = ["07:30"];
  for (let h = 8; h <= 21; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
})();

const TASK_BY_STATUS: Record<EmployeeStatus, TaskCode[]> = {
  PHARMACIEN: ["COMPTOIR"],
  TITULAIRE: ["COMPTOIR", "PARAPHARMACIE", "REUNION_FOURNISSEUR"],
  PREPARATEUR: ["COMPTOIR", "PARAPHARMACIE", "MAIL"],
  ETUDIANT: ["COMPTOIR"],
  LIVREUR: ["LIVRAISON"],
  BACK_OFFICE: ["COMMANDE"],
  SECRETAIRE: ["SECRETARIAT", "COMMANDE"],
};

function shouldWork(dayOfWeek: number, slot: string, weeklyHours: number) {
  if (dayOfWeek === 5) return slot >= "08:30" && slot < "13:00";
  if (weeklyHours <= 20 && (dayOfWeek === 1 || dayOfWeek === 3)) return false;
  if (slot >= "12:30" && slot < "14:00") return false;
  return slot >= "08:30" && slot < "19:30";
}

function pickTask(status: EmployeeStatus, slot: string): TaskCode {
  const pool = TASK_BY_STATUS[status];
  if (slot >= "10:00" && slot < "11:00" && pool.length > 1) return pool[1];
  if (slot >= "16:00" && slot < "17:00" && pool.length > 2) return pool[2];
  return pool[0];
}

// Quelques absences pour le réalisme
const ABSENCES: Array<{ employeeId: string; dayOfWeek: number; code: AbsenceCode }> = [
  { employeeId: "e6", dayOfWeek: 2, code: "CONGE" }, // Élodie mercredi
  { employeeId: "e6", dayOfWeek: 3, code: "CONGE" },
  { employeeId: "e9", dayOfWeek: 0, code: "MALADIE" }, // Emma lundi
  { employeeId: "e12", dayOfWeek: 4, code: "FORMATION_ABS" }, // Camille vendredi
];

function buildEntries(weekDates: string[]): ScheduleEntryDTO[] {
  const out: ScheduleEntryDTO[] = [];
  let id = 1;
  weekDates.forEach((dateIso, dayOfWeek) => {
    MOCK_EMPLOYEES.forEach((emp) => {
      const absent = ABSENCES.find(
        (a) => a.employeeId === emp.id && a.dayOfWeek === dayOfWeek
      );
      TIME_SLOTS.forEach((slot) => {
        if (!shouldWork(dayOfWeek, slot, emp.weeklyHours)) return;
        if (absent) {
          out.push({
            id: `m${id++}`,
            employeeId: emp.id,
            date: dateIso,
            timeSlot: slot,
            type: ScheduleType.ABSENCE,
            taskCode: null,
            absenceCode: absent.code,
            notes: null,
          });
        } else {
          out.push({
            id: `m${id++}`,
            employeeId: emp.id,
            date: dateIso,
            timeSlot: slot,
            type: ScheduleType.TASK,
            taskCode: pickTask(emp.status, slot),
            absenceCode: null,
            notes: null,
          });
        }
      });
    });
  });
  return out;
}

export default function DemoPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const base = searchParams.week
    ? new Date(`${searchParams.week}T00:00:00`)
    : new Date();
  const monday = startOfWeek(base);
  const days = weekDays(monday);
  const weekStartIso = toIsoDate(monday);
  const dayDates = days.map(toIsoDate);
  const entries = buildEntries(dayDates);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-violet-600 text-white px-4 py-2 text-sm text-center">
        🔍 Mode démo — données factices, lecture seule · Pas de BDD requise
      </div>
      <PlanningView
        initialWeekStart={weekStartIso}
        employees={MOCK_EMPLOYEES}
        initialEntries={entries}
        role="EMPLOYEE"
        minStaff={4}
      />
    </div>
  );
}
