"use client";

import { useEffect, useMemo } from "react";
import { Printer } from "lucide-react";
import {
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_LABELS,
  TIME_SLOTS,
  WEEK_DAYS,
  type ScheduleEntryDTO,
} from "@/types";
import { dailyTaskHours, indexEntriesByEmployee } from "@/lib/planning-utils";
import { cn } from "@/lib/utils";

type Collaborator = {
  id: string;
  firstName: string;
  lastName: string;
  status: keyof typeof STATUS_LABELS;
  weeklyHours: number;
  displayColor: string;
  isActive: boolean;
};

/**
 * Feuille A4 imprimable de la semaine d'un collaborateur.
 *  - Style optimisé impression (A4 portrait, pas de couleurs criardes)
 *  - Auto-déclenche window.print() au mount
 *  - Bouton "Réimprimer" visible à l'écran (caché en mode print)
 */
export function SoloPrintSheet({
  collaborator,
  weekNumber,
  weekKind,
  dayDates,
  entries,
  pharmacyName,
}: {
  collaborator: Collaborator;
  weekStart?: string;
  weekNumber: number;
  weekKind: "S1" | "S2";
  dayDates: string[];
  entries: ScheduleEntryDTO[];
  pharmacyName: string;
}) {
  // Auto-print 200 ms après le 1er paint pour laisser le DOM se stabiliser.
  useEffect(() => {
    const id = setTimeout(() => window.print(), 250);
    return () => clearTimeout(id);
  }, []);

  const index = useMemo(() => indexEntriesByEmployee(entries), [entries]);
  const totalHours = useMemo(
    () =>
      dayDates.reduce((s, d) => s + dailyTaskHours(collaborator.id, d, index), 0),
    [collaborator.id, dayDates, index]
  );
  const overtime = totalHours - collaborator.weeklyHours;

  // Compacte les créneaux contigus avec la même valeur en blocs (ex: 9:00-12:30 Cptoir)
  const blocksByDay = useMemo(() => {
    const map = new Map<string, Array<{ from: string; to: string; entry: ScheduleEntryDTO }>>();
    for (const date of dayDates) {
      const blocks: Array<{ from: string; to: string; entry: ScheduleEntryDTO }> = [];
      let current: { from: string; entry: ScheduleEntryDTO } | null = null;
      for (let i = 0; i < TIME_SLOTS.length; i++) {
        const slot = TIME_SLOTS[i];
        const e = index.get(collaborator.id)?.get(date)?.get(slot) ?? null;
        const sameAsCurrent =
          current &&
          e &&
          e.type === current.entry.type &&
          e.taskCode === current.entry.taskCode &&
          e.absenceCode === current.entry.absenceCode;
        if (sameAsCurrent) continue;
        if (current) {
          blocks.push({ from: current.from, to: slot, entry: current.entry });
          current = null;
        }
        if (e) current = { from: slot, entry: e };
      }
      if (current) {
        // Ferme le dernier bloc à la fin du dernier slot + 30 min
        const lastSlot = TIME_SLOTS[TIME_SLOTS.length - 1];
        const [h, m] = lastSlot.split(":").map(Number);
        const endMin = h * 60 + m + 30;
        const endStr = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
        blocks.push({ from: current.from, to: endStr, entry: current.entry });
      }
      map.set(date, blocks);
    }
    return map;
  }, [collaborator.id, dayDates, index]);

  return (
    <>
      {/* En-tête écran (caché à l'impression) */}
      <div className="no-print mx-auto max-w-3xl p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            Aperçu impression — {collaborator.firstName}{" "}
            {collaborator.lastName !== "—" ? collaborator.lastName : ""}
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

      {/* Feuille imprimable */}
      <article className="solo-sheet mx-auto max-w-[210mm] bg-white p-8 print:p-0 print:max-w-none">
        {/* En-tête */}
        <header className="mb-5 flex items-baseline justify-between border-b-2 border-zinc-300 pb-3">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight">
              {collaborator.firstName}{" "}
              {collaborator.lastName !== "—" ? collaborator.lastName : ""}
            </h2>
            <p className="text-[12px] text-zinc-600">
              {STATUS_LABELS[collaborator.status]} ·{" "}
              {collaborator.weeklyHours}h/semaine
            </p>
          </div>
          <div className="text-right">
            <p className="text-[14px] font-semibold">
              Semaine {weekNumber} · {weekKind}
            </p>
            <p className="text-[11px] text-zinc-600">
              du {formatDate(dayDates[0])} au {formatDate(dayDates[5])}
            </p>
            <p className="mt-1 text-[10px] text-zinc-400">{pharmacyName}</p>
          </div>
        </header>

        {/* Tableau jours × blocs */}
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {dayDates.map((d, i) => (
                <th
                  key={d}
                  className="border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-left font-semibold"
                  style={{ width: `${100 / 6}%` }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="uppercase tracking-wide">
                      {WEEK_DAYS[i]}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-zinc-600">
                      {new Date(d).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {dayDates.map((d) => {
                const blocks = blocksByDay.get(d) ?? [];
                const dayHours = dailyTaskHours(collaborator.id, d, index);
                return (
                  <td
                    key={d}
                    className="border border-zinc-300 align-top p-1.5"
                    style={{ height: "180mm" }}
                  >
                    {blocks.length === 0 ? (
                      <p className="mt-2 text-center text-[10px] italic text-zinc-400">
                        repos
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {blocks.map((b, idx) => {
                          const e = b.entry;
                          if (e.type === "TASK" && e.taskCode) {
                            const c = TASK_COLORS[e.taskCode];
                            return (
                              <div
                                key={idx}
                                className="rounded px-1.5 py-1 ring-1 ring-inset"
                                style={{
                                  background: c.bg,
                                  color: c.text,
                                  borderColor: c.border,
                                }}
                              >
                                <p className="font-mono text-[9.5px] tabular-nums opacity-80">
                                  {b.from}-{b.to}
                                </p>
                                <p className="text-[10.5px] font-semibold leading-tight">
                                  {TASK_LABELS[e.taskCode]}
                                </p>
                              </div>
                            );
                          }
                          if (e.type === "ABSENCE" && e.absenceCode) {
                            const s = ABSENCE_STYLES[e.absenceCode];
                            return (
                              <div
                                key={idx}
                                className="rounded px-1.5 py-1 ring-1 ring-inset"
                                style={{
                                  background: s.bg,
                                  color: s.text,
                                  borderColor: s.border,
                                  backgroundImage:
                                    "repeating-linear-gradient(45deg, rgba(0,0,0,0.08) 0 1.5px, transparent 1.5px 6px)",
                                }}
                              >
                                <p className="font-mono text-[9.5px] tabular-nums opacity-80">
                                  {b.from}-{b.to}
                                </p>
                                <p className="text-[10.5px] font-semibold leading-tight">
                                  {ABSENCE_LABELS[e.absenceCode]}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                    <div
                      className={cn(
                        "mt-2 rounded border-t border-dashed border-zinc-300 pt-1.5 text-right font-mono text-[10px] tabular-nums",
                        dayHours === 0 ? "text-zinc-400" : "text-zinc-700"
                      )}
                    >
                      {dayHours.toFixed(1)}h
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>

        {/* Pied : total semaine */}
        <footer className="mt-3 flex items-baseline justify-between border-t-2 border-zinc-300 pt-2 text-[11px]">
          <p className="text-zinc-500">
            <span className="hidden sm:inline">
              Imprimé le {new Date().toLocaleDateString("fr-FR")} · planning
              indicatif, susceptible d&apos;ajustements
            </span>
          </p>
          <p className="font-semibold">
            Total semaine :{" "}
            <span className="font-mono tabular-nums">
              {totalHours.toFixed(1)}h
            </span>
            {overtime > 0.1 && (
              <span className="ml-2 text-[10px] font-medium text-rose-600">
                (+{overtime.toFixed(1)}h sup.)
              </span>
            )}
            {overtime < -0.1 && (
              <span className="ml-2 text-[10px] font-medium text-amber-600">
                ({overtime.toFixed(1)}h sous contrat)
              </span>
            )}
          </p>
        </footer>
      </article>

      {/* Styles d'impression : bascule en paysage A4 + cache la sidebar */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          aside,
          header.md\\:hidden,
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .solo-sheet {
            box-shadow: none !important;
          }
        }
      `}</style>
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
