"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import type { TaskCode, AbsenceCode, EmployeeStatus } from "@prisma/client";
import {
  TASK_LABELS,
  TASK_COLORS,
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  TIME_SLOTS,
  WEEK_DAYS,
  type ScheduleEntryDTO,
} from "@/types";
import {
  staffingForSlot,
  staffingLevel,
  indexEntriesByEmployee,
} from "@/lib/planning-utils";

export type GabaritPrintEntry = {
  dayOfWeek: number; // 0 = Lundi … 5 = Samedi
  employeeId: string;
  timeSlot: string;
  type: "TASK" | "ABSENCE";
  taskCode: TaskCode | null;
  absenceCode: AbsenceCode | null;
};

export type GabaritPrintEmployee = {
  id: string;
  name: string;
  color: string;
  status: EmployeeStatus;
};

type Props = {
  templateName: string;
  weekType: string;
  category: string | null;
  description: string | null;
  pharmacyName: string;
  employees: GabaritPrintEmployee[];
  entries: GabaritPrintEntry[];
  /** Si défini (0=Lundi…5=Samedi) : n'imprime QUE ce jour. Sinon : la semaine. */
  onlyDay?: number | null;
  /** Seuil d'effectif minimum de l'officine (colonne effectif). */
  minStaff?: number;
};

const COUNTER_ROLES: EmployeeStatus[] = ["PHARMACIEN", "PREPARATEUR", "ETUDIANT"];

// Couleurs de la colonne effectif (hex explicites → fiables à l'impression).
const STAFF_BG: Record<"ok" | "warning" | "critical", string> = {
  ok: "#ecfdf5", // emerald-50
  warning: "#fef3c7", // amber-100
  critical: "#fee2e2", // red-100
};
const STAFF_TEXT: Record<"ok" | "warning" | "critical", string> = {
  ok: "#047857", // emerald-700
  warning: "#92400e", // amber-800
  critical: "#b91c1c", // red-700
};

/** Contenu d'une cellule (libellé + couleurs) ou null si vide. */
function cellOf(e: GabaritPrintEntry | undefined) {
  if (!e) return null;
  if (e.type === "TASK" && e.taskCode) {
    return { label: TASK_LABELS[e.taskCode], style: TASK_COLORS[e.taskCode] };
  }
  if (e.type === "ABSENCE" && e.absenceCode) {
    return {
      label: ABSENCE_LABELS[e.absenceCode],
      style: ABSENCE_STYLES[e.absenceCode],
    };
  }
  return null;
}

/**
 * Vue imprimable d'un gabarit de semaine (A4 paysage). Une grille compacte par
 * jour : colonnes = collaborateurs présents ce jour, lignes = créneaux réellement
 * utilisés. Aperçu à l'écran + impression navigateur. Le CSS `@media print`
 * masque toute l'interface (sidebar, etc.) via le classique trick `visibility`.
 */
export function GabaritPrintView({
  templateName,
  weekType,
  category,
  description,
  pharmacyName,
  employees,
  entries,
  onlyDay = null,
  minStaff = 4,
}: Props) {
  // Effectif comptoir par créneau — mêmes règles que le planning
  // (staffingForSlot). Index factice : la « date » = numéro du jour (0-5).
  const staffIndex = indexEntriesByEmployee(
    entries.map<ScheduleEntryDTO>((e, i) => ({
      id: String(i),
      employeeId: e.employeeId,
      date: String(e.dayOfWeek),
      timeSlot: e.timeSlot,
      type: e.type,
      taskCode: e.taskCode,
      absenceCode: e.absenceCode,
      notes: null,
    }))
  );
  const counterIds = employees
    .filter((e) => COUNTER_ROLES.includes(e.status))
    .map((e) => e.id);
  const allIds = employees.map((e) => e.id);
  // Ouvre la boîte d'impression automatiquement à l'arrivée (léger délai pour
  // laisser la page se peindre). L'utilisateur peut aussi cliquer « Imprimer ».
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  // Y a-t-il quelque chose à imprimer dans le périmètre demandé ?
  const hasContent = entries.some(
    (e) => onlyDay == null || e.dayOfWeek === onlyDay
  );

  return (
    <div className="gab-print min-h-screen bg-white p-4 text-zinc-900 sm:p-6">
      <style>{PRINT_CSS}</style>

      {/* Barre d'actions — masquée à l'impression */}
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-zinc-500">
          Aperçu avant impression · la boîte d&apos;impression s&apos;ouvre
          automatiquement.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-violet-700"
          >
            <Printer className="h-4 w-4" /> Imprimer
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" /> Fermer
          </button>
        </div>
      </div>

      {/* En-tête du document */}
      <header className="mb-4 border-b border-zinc-300 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="rounded bg-violet-100 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-violet-700">
            {weekType}
          </span>
          <h1 className="text-xl font-bold tracking-tight">
            {templateName || "Gabarit sans nom"}
          </h1>
          {category && (
            <span className="text-[13px] text-zinc-500">· {category}</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-zinc-500">
          <span>{pharmacyName}</span>
          {onlyDay != null && (
            <span className="font-medium text-zinc-700">
              · {WEEK_DAYS[onlyDay]} uniquement
            </span>
          )}
          {description && <span>· {description}</span>}
        </div>
      </header>

      {!hasContent && (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-[13px] text-zinc-500">
          {onlyDay != null
            ? `Aucun poste programmé pour ${WEEK_DAYS[onlyDay]} dans ce gabarit.`
            : "Ce gabarit est vide pour l'instant."}
        </p>
      )}

      {/* Une grille par jour (ou uniquement le jour demandé) */}
      <div className="space-y-4">
        {WEEK_DAYS.map((dayLabel, day) => {
          if (onlyDay != null && day !== onlyDay) return null;
          const dayEntries = entries.filter((e) => e.dayOfWeek === day);
          if (dayEntries.length === 0) return null;

          // TOUTE l'équipe en colonnes (dans l'ordre d'affichage), y compris
          // les collaborateurs qui ne travaillent PAS ce jour → colonne vide,
          // pour retrouver la grille complète comme à l'écran.
          const dayEmployees = employees;

          // Plage de créneaux réellement utilisée (du 1er au dernier).
          const usedSlots = new Set(dayEntries.map((e) => e.timeSlot));
          const indices = [...usedSlots]
            .map((s) => TIME_SLOTS.indexOf(s))
            .filter((i) => i >= 0);
          const from = Math.min(...indices);
          const to = Math.max(...indices);
          const slots = TIME_SLOTS.slice(from, to + 1);

          // Index rapide (employé|créneau) → entrée.
          const byKey = new Map(
            dayEntries.map((e) => [`${e.employeeId}|${e.timeSlot}`, e])
          );

          // Cellules par employé sur la plage — sert à n'afficher le LIBELLÉ du
          // poste qu'au DÉBUT d'une série de créneaux identiques (ensuite la
          // couleur suffit, comme sur le planning).
          const cellsByEmp = new Map(
            dayEmployees.map((emp) => [
              emp.id,
              slots.map((slot) => cellOf(byKey.get(`${emp.id}|${slot}`))),
            ])
          );

          return (
            <section key={day} className="gab-day">
              <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-zinc-700">
                {dayLabel}
              </h2>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th className="border border-zinc-300 bg-zinc-100 px-1 py-1 text-left font-semibold">
                      Heure
                    </th>
                    {dayEmployees.map((emp) => (
                      <th
                        key={emp.id}
                        className="border border-zinc-300 bg-zinc-100 px-1 py-1 font-semibold"
                      >
                        <span className="flex items-center justify-center gap-1">
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: emp.color }}
                          />
                          {emp.name}
                        </span>
                      </th>
                    ))}
                    <th
                      className="border border-zinc-300 bg-zinc-100 px-1 py-1 font-semibold"
                      title="Effectif comptoir sur le créneau (pharmaciens/préparateurs/étudiants, remplacements comptés, échange & commande exclus)"
                    >
                      Eff.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot, si) => {
                    const eff = staffingForSlot(
                      String(day),
                      slot,
                      counterIds,
                      staffIndex,
                      allIds
                    );
                    const lvl = staffingLevel(eff, minStaff);
                    return (
                      <tr key={slot}>
                        <td className="border border-zinc-300 bg-zinc-50 px-1 py-0.5 font-mono tabular-nums text-zinc-600">
                          {slot}
                        </td>
                        {dayEmployees.map((emp) => {
                          const empCells = cellsByEmp.get(emp.id);
                          const cell = empCells ? empCells[si] : null;
                          const prev = empCells && si > 0 ? empCells[si - 1] : null;
                          // Libellé seulement au début d'une série (sinon couleur seule).
                          const showLabel =
                            !!cell && (!prev || prev.label !== cell.label);
                          return (
                            <td
                              key={emp.id}
                              className="border border-zinc-300 px-1 py-0.5 text-center"
                              style={
                                cell
                                  ? {
                                      backgroundColor: cell.style.bg,
                                      color: cell.style.text,
                                    }
                                  : undefined
                              }
                            >
                              {showLabel ? cell.label : ""}
                            </td>
                          );
                        })}
                        <td
                          className="border border-zinc-300 px-1 py-0.5 text-center font-semibold tabular-nums"
                          style={{
                            backgroundColor: STAFF_BG[lvl],
                            color: STAFF_TEXT[lvl],
                          }}
                        >
                          {eff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  body * { visibility: hidden !important; }
  .gab-print, .gab-print * { visibility: visible !important; }
  .gab-print { position: absolute !important; left: 0; top: 0; width: 100%; padding: 0 !important; }
  .no-print { display: none !important; }
  .gab-day { break-inside: avoid; page-break-inside: avoid; }
}
.gab-print, .gab-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;
