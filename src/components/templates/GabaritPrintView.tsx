"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import type { TaskCode, AbsenceCode } from "@prisma/client";
import {
  TASK_LABELS,
  TASK_COLORS,
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  TIME_SLOTS,
  WEEK_DAYS,
} from "@/types";

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
}: Props) {
  // Ouvre la boîte d'impression automatiquement à l'arrivée (léger délai pour
  // laisser la page se peindre). L'utilisateur peut aussi cliquer « Imprimer ».
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const orderIndex = new Map(employees.map((e, i) => [e.id, i]));

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

          // Collaborateurs présents ce jour (dans l'ordre d'affichage).
          const empIds = [...new Set(dayEntries.map((e) => e.employeeId))].sort(
            (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0)
          );
          const dayEmployees = empIds
            .map((id) => employees.find((e) => e.id === id))
            .filter((e): e is GabaritPrintEmployee => !!e);

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
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot}>
                      <td className="border border-zinc-300 bg-zinc-50 px-1 py-0.5 font-mono tabular-nums text-zinc-600">
                        {slot}
                      </td>
                      {dayEmployees.map((emp) => {
                        const cell = cellOf(byKey.get(`${emp.id}|${slot}`));
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
                            {cell?.label ?? ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
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
