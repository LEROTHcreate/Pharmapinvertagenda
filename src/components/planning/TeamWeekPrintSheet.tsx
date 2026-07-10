"use client";

import { useEffect, useMemo } from "react";
import { Printer } from "lucide-react";
import {
  ABSENCE_LABELS,
  STATUS_LABELS,
  TIME_SLOTS,
  isNonWorkedTask,
  type ScheduleEntryDTO,
} from "@/types";
import {
  dailyTaskHours,
  indexEntriesByEmployee,
  staffingForSlot,
  staffingLevel,
  type EmployeeDayMap,
} from "@/lib/planning-utils";

type EmployeeRef = {
  id: string;
  firstName: string;
  lastName: string;
  status: keyof typeof STATUS_LABELS;
  weeklyHours: number;
};

const COUNTER_ROLES = ["PHARMACIEN", "PREPARATEUR", "ETUDIANT"];

// Couleurs de l'effectif (hex explicites → fiables à l'impression).
const STAFF_BG: Record<"ok" | "warning" | "critical", string> = {
  ok: "#ecfdf5",
  warning: "#fef3c7",
  critical: "#fee2e2",
};
const STAFF_TEXT: Record<"ok" | "warning" | "critical", string> = {
  ok: "#047857",
  warning: "#92400e",
  critical: "#b91c1c",
};

/**
 * Effectif comptoir MINIMUM d'une journée (règles planning : pharmaciens/
 * préparateurs/étudiants sur une vraie tâche, REMPLACEMENT compté, ECHANGE &
 * COMMANDE exclus), calculé sur la fenêtre de présence comptoir (1er → dernier
 * créneau avec effectif > 0) pour ne pas compter les créneaux de prépa avant
 * ouverture. Renvoie null si aucune présence comptoir ce jour.
 */
function dayMinStaffing(
  date: string,
  counterIds: string[],
  allIds: string[],
  index: Map<string, EmployeeDayMap>
): number | null {
  const perSlot = TIME_SLOTS.map((slot) =>
    staffingForSlot(date, slot, counterIds, index, allIds)
  );
  let first = -1;
  let last = -1;
  perSlot.forEach((n, i) => {
    if (n > 0) {
      if (first < 0) first = i;
      last = i;
    }
  });
  if (first < 0) return null;
  let min = Infinity;
  for (let i = first; i <= last; i++) min = Math.min(min, perSlot[i]);
  return isFinite(min) ? min : null;
}

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** "09:00" → "9h", "12:30" → "12h30" (format horaire compact FR). */
function fmtTime(slot: string): string {
  const [h, m] = slot.split(":");
  const hh = String(Number(h));
  return m === "00" ? `${hh}h` : `${hh}h${m}`;
}

/** Fin d'un créneau "HH:MM" = début + 30 min, en libellé compact. */
function slotEndLabel(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const end = h * 60 + m + 30;
  const eh = Math.floor(end / 60);
  const em = end % 60;
  return em === 0 ? `${eh}h` : `${eh}h${String(em).padStart(2, "0")}`;
}

type DayCell = { intervals: string[]; absence: string | null };

/**
 * Résume la journée d'un collaborateur en plages horaires travaillées (fusion
 * des créneaux TASK contigus), + un éventuel libellé d'absence. Les postes
 * « non travaillés » (ÉCHANGE) ne comptent pas comme présence.
 */
function buildDayCell(
  empId: string,
  date: string,
  index: Map<string, EmployeeDayMap>
): DayCell {
  const day = index.get(empId)?.get(date);
  if (!day) return { intervals: [], absence: null };

  let absence: string | null = null;
  const workedIdx: number[] = [];
  TIME_SLOTS.forEach((slot, i) => {
    const e = day.get(slot);
    if (!e) return;
    if (e.type === "ABSENCE" && e.absenceCode) {
      absence = ABSENCE_LABELS[e.absenceCode];
    } else if (e.type === "TASK" && e.taskCode && !isNonWorkedTask(e.taskCode)) {
      workedIdx.push(i);
    }
  });

  // Fusionne les indices de créneaux contigus en intervalles.
  const intervals: string[] = [];
  let runStart = -1;
  let prev = -2;
  const flush = (endIdx: number) => {
    if (runStart >= 0) {
      intervals.push(`${fmtTime(TIME_SLOTS[runStart])}–${slotEndLabel(TIME_SLOTS[endIdx])}`);
    }
  };
  for (const i of workedIdx) {
    if (i === prev + 1) {
      prev = i;
    } else {
      flush(prev);
      runStart = i;
      prev = i;
    }
  }
  if (workedIdx.length > 0) flush(prev);

  return { intervals, absence };
}

/**
 * Feuille A4 (paysage) du planning de la SEMAINE pour toute l'équipe —
 * collaborateurs en lignes, jours en colonnes, plages horaires dans les cases.
 * Pensée pour l'affichage en back-office. Auto-imprime au chargement.
 */
export function TeamWeekPrintSheet({
  pharmacyName,
  weekNumber,
  weekKind,
  dayDates,
  employees,
  entries,
  minStaff = 4,
}: {
  pharmacyName: string;
  weekNumber: number;
  weekKind: "S1" | "S2";
  dayDates: string[];
  employees: EmployeeRef[];
  entries: ScheduleEntryDTO[];
  /** Seuil d'effectif minimum de l'officine (ligne effectif comptoir). */
  minStaff?: number;
}) {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 300);
    return () => clearTimeout(id);
  }, []);

  const index = useMemo(() => indexEntriesByEmployee(entries), [entries]);

  // Effectif comptoir minimum par jour (règles planning).
  const dayStaffing = useMemo(() => {
    const counterIds = employees
      .filter((e) => COUNTER_ROLES.includes(e.status))
      .map((e) => e.id);
    const allIds = employees.map((e) => e.id);
    return dayDates.map((d) => dayMinStaffing(d, counterIds, allIds, index));
  }, [employees, dayDates, index]);

  const rows = useMemo(
    () =>
      employees.map((emp) => {
        const cells = dayDates.map((d) => buildDayCell(emp.id, d, index));
        const total = dayDates.reduce((s, d) => s + dailyTaskHours(emp.id, d, index), 0);
        return { emp, cells, total };
      }),
    [employees, dayDates, index]
  );

  const rangeLabel = useMemo(() => {
    const f = (iso: string) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    return `${f(dayDates[0])} au ${f(dayDates[5])}`;
  }, [dayDates]);

  return (
    <div className="team-week-print mx-auto max-w-[1200px] p-6 print:p-0">
      {/* Styles d'impression PROPRES à cette feuille : on neutralise la
          compression agressive de la grille par créneaux (globals.css) — ici
          le tableau est léger (7 colonnes) et doit rester lisible. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          main { zoom: 1 !important; }
          .team-week-print table { font-size: 9pt !important; }
          .team-week-print th, .team-week-print td { height: auto !important; }
        }
      `}</style>

      {/* Bouton réimprimer (écran uniquement) */}
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-violet-700"
        >
          <Printer className="h-4 w-4" /> Réimprimer
        </button>
      </div>

      {/* En-tête */}
      <header className="mb-4 flex items-end justify-between border-b-2 border-zinc-800 pb-2">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-zinc-900">{pharmacyName}</h1>
          <p className="text-[13px] text-zinc-600">
            Planning de la semaine — {rangeLabel}
          </p>
        </div>
        <div className="text-right text-[12px] text-zinc-600">
          <p className="font-semibold text-zinc-800">
            Semaine {weekNumber} · {weekKind}
          </p>
        </div>
      </header>

      {/* Tableau collaborateurs × jours */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-zinc-100">
            <th className="border border-zinc-300 px-2 py-1.5 text-left font-semibold text-zinc-700">
              Collaborateur
            </th>
            {dayDates.map((d, i) => (
              <th
                key={d}
                className="border border-zinc-300 px-2 py-1.5 text-center font-semibold text-zinc-700"
              >
                {DAY_NAMES[i]}
                <span className="block text-[9px] font-normal text-zinc-500">
                  {new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "numeric",
                  })}
                </span>
              </th>
            ))}
            <th className="border border-zinc-300 px-2 py-1.5 text-center font-semibold text-zinc-700">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ emp, cells, total }) => (
            <tr key={emp.id} className="align-top">
              <td className="border border-zinc-300 px-2 py-1">
                <span className="font-semibold text-zinc-900">
                  {emp.firstName} {emp.lastName}
                </span>
                <span className="block text-[9px] text-zinc-500">
                  {STATUS_LABELS[emp.status]}
                </span>
              </td>
              {cells.map((c, i) => (
                <td
                  key={i}
                  className="border border-zinc-300 px-1.5 py-1 text-center text-zinc-800"
                >
                  {c.absence ? (
                    <span className="font-medium text-zinc-500">{c.absence}</span>
                  ) : c.intervals.length > 0 ? (
                    c.intervals.map((iv, k) => (
                      <span key={k} className="block whitespace-nowrap tabular-nums">
                        {iv}
                      </span>
                    ))
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
              ))}
              <td className="border border-zinc-300 px-2 py-1 text-center font-semibold tabular-nums text-zinc-900">
                {total > 0 ? `${total.toLocaleString("fr-FR")} h` : "—"}
              </td>
            </tr>
          ))}
          {/* Effectif comptoir minimum par jour (règles du planning). */}
          <tr className="bg-zinc-50">
            <td className="border border-zinc-300 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
              Effectif comptoir (min)
            </td>
            {dayStaffing.map((n, i) => {
              const lvl = n === null ? null : staffingLevel(n, minStaff);
              return (
                <td
                  key={i}
                  className="border border-zinc-300 px-1.5 py-1.5 text-center font-bold tabular-nums"
                  style={
                    lvl
                      ? { backgroundColor: STAFF_BG[lvl], color: STAFF_TEXT[lvl] }
                      : undefined
                  }
                >
                  {n === null ? <span className="text-zinc-300">—</span> : n}
                </td>
              );
            })}
            <td className="border border-zinc-300 bg-zinc-100" />
          </tr>
        </tbody>
      </table>

      <footer className="mt-3 flex items-center justify-between text-[9px] text-zinc-400">
        <span>PharmaPlanning · {pharmacyName}</span>
        <span>Horaires en heures pleines · absences indiquées par leur libellé</span>
      </footer>
    </div>
  );
}
