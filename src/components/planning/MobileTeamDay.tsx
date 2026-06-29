"use client";

import { useMemo } from "react";
import { Coffee } from "lucide-react";
import {
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_LABELS,
  TIME_SLOTS,
  type EmployeeDTO,
} from "@/types";
import type { EmployeeDayMap } from "@/lib/planning-utils";
import { staffingLevel } from "@/lib/planning-utils";
import { cn } from "@/lib/utils";

/**
 * Vue "Équipe — Jour" pour mobile : une frise horaire verticale.
 *
 * Plutôt qu'une grille à 20 colonnes illisible sur téléphone, on déroule la
 * journée par tranches horaires : pour chaque plage où l'équipe présente est
 * stable, on affiche QUI est là et SUR QUEL POSTE, avec l'effectif comptoir.
 * On lit toute la journée d'un coup d'œil en scrollant verticalement (geste
 * naturel au pouce), sans scroll latéral.
 */
export function MobileTeamDay({
  employees,
  date,
  index,
  minStaff,
  currentEmployeeId,
}: {
  employees: EmployeeDTO[];
  /** Jour affiché au format YYYY-MM-DD. */
  date: string;
  index: Map<string, EmployeeDayMap>;
  minStaff: number;
  currentEmployeeId: string | null;
}) {
  // Effectif "comptoir" = pharmaciens + préparateurs uniquement (cohérent
  // avec la colonne "Eff" de la grille desktop).
  const counterStatuses = useMemo(
    () => new Set(["PHARMACIEN", "PREPARATEUR"]),
    []
  );

  // Compresse les créneaux 30 min contigus où le « roster » (qui fait quoi)
  // est identique → un seul bloc. Ex : 08:00→10:00 avec Marie·Cptoir +
  // Léa·Para devient un bloc unique au lieu de 4 lignes répétées.
  const blocks = useMemo(() => {
    type Member = { emp: EmployeeDTO; taskCode: string };
    type Block = { from: string; to: string; members: Member[] };

    // Pré-trie les employés une fois (pharma/prépa d'abord, puis ordre
    // d'affichage) pour un rendu stable et lisible.
    const sortedEmployees = [...employees].sort((a, b) => {
      const aw = counterStatuses.has(a.status) ? 0 : 1;
      const bw = counterStatuses.has(b.status) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.displayOrder - b.displayOrder;
    });

    // Construit le roster (liste des présents en TASK) pour un créneau donné.
    const rosterForSlot = (slot: string): Member[] => {
      const out: Member[] = [];
      for (const emp of sortedEmployees) {
        const e = index.get(emp.id)?.get(date)?.get(slot);
        if (e?.type === "TASK" && e.taskCode) {
          out.push({ emp, taskCode: e.taskCode });
        }
      }
      return out;
    };

    // Signature stable d'un roster pour détecter les plages identiques.
    const sig = (members: Member[]) =>
      members.map((m) => `${m.emp.id}:${m.taskCode}`).join("|");

    const slotEnd = (slot: string) => {
      const [h, m] = slot.split(":").map(Number);
      const end = h * 60 + m + 30;
      return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(
        end % 60
      ).padStart(2, "0")}`;
    };

    const out: Block[] = [];
    let current: { from: string; members: Member[]; sig: string } | null = null;
    for (const slot of TIME_SLOTS) {
      const members = rosterForSlot(slot);
      const s = sig(members);
      if (members.length === 0) {
        // Trou d'effectif : on ferme le bloc en cours (on n'affiche pas les
        // tranches vides, le saut d'horaire les rend visibles implicitement).
        if (current) {
          out.push({ from: current.from, to: slot, members: current.members });
          current = null;
        }
        continue;
      }
      if (current && current.sig === s) continue;
      if (current) out.push({ from: current.from, to: slot, members: current.members });
      current = { from: slot, members, sig: s };
    }
    if (current) {
      out.push({
        from: current.from,
        to: slotEnd(TIME_SLOTS[TIME_SLOTS.length - 1]),
        members: current.members,
      });
    }
    return out;
  }, [employees, date, index, counterStatuses]);

  // Absents du jour (toutes absences confondues) → bandeau récap en haut.
  const absents = useMemo(() => {
    const out: Array<{ emp: EmployeeDTO; code: string }> = [];
    for (const emp of employees) {
      const day = index.get(emp.id)?.get(date);
      if (!day) continue;
      const abs = Array.from(day.values()).find((e) => e.type === "ABSENCE");
      if (abs?.absenceCode) out.push({ emp, code: abs.absenceCode });
    }
    return out;
  }, [employees, date, index]);

  const totalPresent = useMemo(() => {
    const ids = new Set<string>();
    for (const b of blocks) for (const m of b.members) ids.add(m.emp.id);
    return ids.size;
  }, [blocks]);

  // Heure courante "HH:MM" si le jour affiché est aujourd'hui — sert à
  // surligner le créneau en cours ("maintenant"). null sinon.
  const nowHHMM = useMemo(() => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (todayIso !== date) return null;
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }, [date]);

  if (blocks.length === 0 && absents.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 px-5 py-10 text-center">
        <Coffee className="h-8 w-8 mx-auto text-amber-500/80" />
        <p className="mt-3 text-[14px] font-medium text-foreground">
          Aucun créneau ce jour
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Le planning de cette journée est vide.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Planning équipe du jour" className="space-y-2.5">
      {/* Récap effectif présent */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {totalPresent}
          </span>{" "}
          présent{totalPresent > 1 ? "s" : ""} sur la journée
        </p>
        <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60">
          Effectif min {minStaff}
        </span>
      </div>

      {/* Bandeau absents */}
      {absents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-amber-700/80 dark:text-amber-400/80 mr-0.5">
            Absents
          </span>
          {absents.map(({ emp, code }) => {
            const s = ABSENCE_STYLES[code as keyof typeof ABSENCE_STYLES];
            return (
              <span
                key={emp.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
                style={{ backgroundColor: s.bg, color: s.text }}
              >
                {emp.firstName}
                <span className="opacity-70 text-[10px]">
                  {ABSENCE_LABELS[code as keyof typeof ABSENCE_LABELS]}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Frise horaire : un bloc par plage à roster stable */}
      <ul className="space-y-1.5">
        {blocks.map((b, i) => {
          const counterEff = b.members.filter((m) =>
            counterStatuses.has(m.emp.status)
          ).length;
          const level = staffingLevel(counterEff, minStaff);
          const pill =
            level === "ok"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : level === "warning"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
          // Créneau en cours (aujourd'hui uniquement) : from ≤ maintenant < to.
          const isCurrent =
            nowHHMM !== null && b.from <= nowHHMM && nowHHMM < b.to;
          return (
            <li
              key={`${b.from}-${i}`}
              className={cn(
                "flex items-stretch gap-2.5 rounded-xl border bg-card px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
                isCurrent
                  ? "border-violet-300 ring-1 ring-violet-300/60 bg-violet-50/40 dark:bg-violet-950/20"
                  : "border-border"
              )}
            >
              {/* Plage horaire */}
              <div className="shrink-0 w-[44px] flex flex-col items-center justify-center font-mono tabular-nums leading-none">
                {isCurrent && (
                  <span className="mb-0.5 inline-flex items-center gap-0.5 text-[8.5px] font-semibold uppercase tracking-[0.04em] text-violet-600 dark:text-violet-300">
                    <span className="h-1 w-1 rounded-full bg-violet-500 animate-pulse" aria-hidden />
                    Live
                  </span>
                )}
                <span className="text-[12.5px] font-bold text-foreground">
                  {b.from}
                </span>
                <span className="my-0.5 text-muted-foreground/40 text-[10px]">
                  ↓
                </span>
                <span className="text-[12.5px] font-semibold text-muted-foreground">
                  {b.to}
                </span>
              </div>

              {/* Chips des présents */}
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1">
                {b.members.map((m) => {
                  const c = TASK_COLORS[m.taskCode as keyof typeof TASK_COLORS];
                  const isMe = m.emp.id === currentEmployeeId;
                  return (
                    <span
                      key={m.emp.id}
                      className={cn(
                        "inline-flex items-baseline gap-1 rounded-lg px-1.5 py-1 text-[11.5px] leading-none border",
                        isMe && "ring-2 ring-violet-400/70"
                      )}
                      style={{
                        backgroundColor: c.bg,
                        color: c.text,
                        borderColor: c.border,
                      }}
                      title={`${m.emp.firstName} ${m.emp.lastName} · ${STATUS_LABELS[m.emp.status]}`}
                    >
                      <span className="font-semibold tracking-tight">
                        {m.emp.firstName}
                      </span>
                      <span className="opacity-75 text-[10px] font-medium">
                        {TASK_LABELS[m.taskCode as keyof typeof TASK_LABELS]}
                      </span>
                    </span>
                  );
                })}
              </div>

              {/* Effectif comptoir de la plage */}
              <div className="shrink-0 flex items-center">
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full text-[11px] font-bold tabular-nums",
                    pill
                  )}
                  title={`${counterEff} au comptoir (pharmaciens + préparateurs)`}
                >
                  {counterEff}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
