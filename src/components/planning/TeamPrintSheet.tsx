"use client";

import { useEffect, useMemo } from "react";
import { Printer } from "lucide-react";
import {
  ABSENCE_LABELS,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_LABELS,
  TIME_SLOTS,
  WEEK_DAYS,
  type ScheduleEntryDTO,
} from "@/types";
import {
  dailyTaskHours,
  indexEntriesByEmployee,
  type EmployeeDayMap,
} from "@/lib/planning-utils";
import { cn } from "@/lib/utils";

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  status: keyof typeof STATUS_LABELS;
  weeklyHours: number;
  displayColor: string;
};

type Block = { from: string; to: string; entry: ScheduleEntryDTO };

/** Compacte les créneaux contigus de même valeur en blocs (ex. 9:00-12:30 Cptoir). */
function compactBlocks(
  empId: string,
  date: string,
  index: Map<string, EmployeeDayMap>
): Block[] {
  const blocks: Block[] = [];
  let current: { from: string; entry: ScheduleEntryDTO } | null = null;
  for (const slot of TIME_SLOTS) {
    const e = index.get(empId)?.get(date)?.get(slot) ?? null;
    const same =
      current &&
      e &&
      e.type === current.entry.type &&
      e.taskCode === current.entry.taskCode &&
      e.absenceCode === current.entry.absenceCode;
    if (same) continue;
    if (current) {
      blocks.push({ from: current.from, to: slot, entry: current.entry });
      current = null;
    }
    if (e) current = { from: slot, entry: e };
  }
  if (current) {
    const last = TIME_SLOTS[TIME_SLOTS.length - 1];
    const [h, m] = last.split(":").map(Number);
    const end = h * 60 + m + 30;
    const endStr = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    blocks.push({ from: current.from, to: endStr, entry: current.entry });
  }
  return blocks;
}

/**
 * Feuille A4 paysage imprimable de la semaine de TOUTE l'équipe — pensée pour
 * l'affichage mural en officine. Lignes = collaborateurs, colonnes = jours
 * (lun→sam). Auto-déclenche l'impression ; multi-page si l'équipe est grande.
 */
export function TeamPrintSheet({
  pharmacyName,
  weekNumber,
  weekKind,
  dayDates,
  employees,
  entries,
}: {
  pharmacyName: string;
  weekNumber: number;
  weekKind: "S1" | "S2";
  dayDates: string[];
  employees: Emp[];
  entries: ScheduleEntryDTO[];
}) {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 300);
    return () => clearTimeout(id);
  }, []);

  const index = useMemo(() => indexEntriesByEmployee(entries), [entries]);

  return (
    <>
      {/* Barre écran (cachée à l'impression) */}
      <div className="no-print mx-auto max-w-5xl p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            Aperçu impression — planning équipe
          </h1>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-[13px] font-medium text-violet-700 hover:bg-violet-100"
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </div>

      <article className="team-sheet mx-auto max-w-[297mm] bg-white p-8 print:p-0 print:max-w-none">
        <header className="mb-4 flex items-baseline justify-between border-b-2 border-zinc-300 pb-2">
          <div>
            <h2 className="text-[20px] font-bold tracking-tight">Planning équipe</h2>
            <p className="text-[11px] text-zinc-600">{pharmacyName}</p>
          </div>
          <div className="text-right">
            <p className="text-[14px] font-semibold">
              Semaine {weekNumber} · {weekKind}
            </p>
            <p className="text-[11px] text-zinc-600">
              du {fmt(dayDates[0])} au {fmt(dayDates[5])}
            </p>
          </div>
        </header>

        <table className="w-full border-collapse text-[10px]">
          <thead className="team-thead">
            <tr>
              <th className="border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-left font-semibold w-[130px]">
                Collaborateur
              </th>
              {dayDates.map((d, i) => (
                <th
                  key={d}
                  className="border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-left font-semibold"
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="uppercase tracking-wide">{WEEK_DAYS[i]}</span>
                    <span className="font-mono text-[9px] tabular-nums text-zinc-500">
                      {new Date(d).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </div>
                </th>
              ))}
              <th className="border border-zinc-300 bg-zinc-100 px-1.5 py-1.5 text-right font-semibold w-[42px]">
                Tot.
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const weekHours = dayDates.reduce(
                (s, d) => s + dailyTaskHours(emp.id, d, index),
                0
              );
              return (
                <tr key={emp.id} className="team-row align-top">
                  {/* Collaborateur */}
                  <td className="border border-zinc-300 px-2 py-1.5 align-top">
                    <div className="flex items-start gap-1.5">
                      <span
                        aria-hidden
                        className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: emp.displayColor }}
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold leading-tight">
                          {emp.firstName}
                          {emp.lastName !== "—" ? ` ${emp.lastName}` : ""}
                        </p>
                        <p className="text-[8.5px] uppercase tracking-wide text-zinc-500">
                          {STATUS_LABELS[emp.status]}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Jours */}
                  {dayDates.map((d) => {
                    const blocks = compactBlocks(emp.id, d, index);
                    return (
                      <td key={d} className="border border-zinc-300 p-1 align-top">
                        {blocks.length === 0 ? (
                          <span className="text-[9px] italic text-zinc-300">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            {blocks.map((b, idx) => {
                              const e = b.entry;
                              const isTask = e.type === "TASK" && e.taskCode;
                              const label = isTask
                                ? TASK_LABELS[e.taskCode!]
                                : e.absenceCode
                                  ? ABSENCE_LABELS[e.absenceCode]
                                  : "";
                              const c =
                                isTask && e.taskCode ? TASK_COLORS[e.taskCode] : null;
                              return (
                                <div
                                  key={idx}
                                  className="rounded px-1 py-0.5 leading-tight ring-1 ring-inset ring-zinc-200"
                                  style={
                                    c
                                      ? { background: c.bg, color: c.text, borderColor: c.border }
                                      : {
                                          background: "#f4f4f5",
                                          color: "#52525b",
                                          backgroundImage:
                                            "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0 1.5px, transparent 1.5px 6px)",
                                        }
                                  }
                                >
                                  <span className="font-mono text-[8px] tabular-nums opacity-80">
                                    {b.from}-{b.to}
                                  </span>{" "}
                                  <span className="text-[9px] font-semibold">{label}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Total semaine */}
                  <td
                    className={cn(
                      "border border-zinc-300 px-1.5 py-1.5 text-right align-top font-mono text-[10px] tabular-nums",
                      weekHours === 0 ? "text-zinc-300" : "text-zinc-800"
                    )}
                  >
                    {weekHours.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <footer className="mt-2 flex items-baseline justify-between border-t border-zinc-300 pt-1.5 text-[9px] text-zinc-500">
          <span>
            Imprimé le {new Date().toLocaleDateString("fr-FR")} · planning
            indicatif, susceptible d&apos;ajustements
          </span>
          <span>{employees.length} collaborateur(s)</span>
        </footer>
      </article>

      {/* Impression A4 paysage, multi-page, en-tête répété. */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          html,
          body {
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          aside,
          header.md\\:hidden,
          .no-print {
            display: none !important;
          }
          /* En-tête de tableau répété en haut de chaque page. */
          .team-thead {
            display: table-header-group;
          }
          /* On évite de couper une ligne collaborateur entre 2 pages. */
          .team-row {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
