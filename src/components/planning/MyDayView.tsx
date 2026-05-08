"use client";

import { useMemo } from "react";
import { Coffee, Sun } from "lucide-react";
import {
  ABSENCE_LABELS,
  ABSENCE_STYLES,
  TASK_COLORS,
  TASK_DESCRIPTIONS,
  TASK_LABELS,
  TIME_SLOTS,
  type EmployeeDTO,
  type ScheduleEntryDTO,
} from "@/types";
import { cn } from "@/lib/utils";

/**
 * Vue "Mon jour" — affichée sur mobile à la place de la grille équipe quand
 * l'utilisateur connecté a une fiche Employee. Présente SA propre journée
 * sous forme de timeline verticale de cartes faciles à lire au pouce.
 *
 * Pour 95% des collaborateurs, c'est ce qu'ils veulent voir : « qu'est-ce
 * que je fais aujourd'hui ? ». La grille équipe complète reste accessible
 * via le toggle en haut.
 */
export function MyDayView({
  employee,
  date,
  entries,
}: {
  employee: EmployeeDTO;
  /** Date au format YYYY-MM-DD (jour sélectionné). */
  date: string;
  /** Toutes les entrées de la semaine (filtrées en interne). */
  entries: ScheduleEntryDTO[];
}) {
  // Compacte les créneaux contigus (même TASK ou même ABSENCE) en blocs
  // — ex: 4 créneaux 30 min de Comptoir contigus → 1 bloc 08:00-10:00.
  const blocks = useMemo(() => {
    const slotMap = new Map<string, ScheduleEntryDTO>();
    for (const e of entries) {
      if (e.employeeId !== employee.id || e.date !== date) continue;
      slotMap.set(e.timeSlot, e);
    }
    const out: Array<{ from: string; to: string; entry: ScheduleEntryDTO }> = [];
    let current: { from: string; entry: ScheduleEntryDTO } | null = null;
    for (let i = 0; i < TIME_SLOTS.length; i++) {
      const slot = TIME_SLOTS[i];
      const e = slotMap.get(slot) ?? null;
      const sameAsCurrent =
        current &&
        e &&
        e.type === current.entry.type &&
        e.taskCode === current.entry.taskCode &&
        e.absenceCode === current.entry.absenceCode;
      if (sameAsCurrent) continue;
      if (current) {
        out.push({ from: current.from, to: slot, entry: current.entry });
        current = null;
      }
      if (e) current = { from: slot, entry: e };
    }
    // Ferme le dernier bloc avec slot + 30 min
    if (current) {
      const lastSlot = TIME_SLOTS[TIME_SLOTS.length - 1];
      const [h, m] = lastSlot.split(":").map(Number);
      const endMin = h * 60 + m + 30;
      const endStr = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      out.push({ from: current.from, to: endStr, entry: current.entry });
    }
    return out;
  }, [employee.id, date, entries]);

  // Total d'heures travaillées (TASK uniquement, pas absences)
  const totalHours = useMemo(() => {
    let mins = 0;
    for (const b of blocks) {
      if (b.entry.type !== "TASK") continue;
      const [fh, fm] = b.from.split(":").map(Number);
      const [th, tm] = b.to.split(":").map(Number);
      mins += th * 60 + tm - (fh * 60 + fm);
    }
    return mins / 60;
  }, [blocks]);

  // Contrat journalier moyen (sur 6 jours ouvrés)
  const dailyContract = employee.weeklyHours / 6;
  const delta = totalHours - dailyContract;

  // Date affichable au format humain : "jeudi 7 mai"
  const dateLabel = useMemo(() => {
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, [date]);

  const hasOnlyAbsence =
    blocks.length > 0 && blocks.every((b) => b.entry.type === "ABSENCE");
  const isFullRest = blocks.length === 0;

  return (
    <section
      aria-label={`Mon planning du ${dateLabel}`}
      className="space-y-3"
    >
      {/* En-tête : date + total heures */}
      <header className="px-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground capitalize">
          {dateLabel}
        </h2>
        {!isFullRest && !hasOnlyAbsence && (
          <p className="text-[12px] text-muted-foreground mt-0.5 tabular-nums">
            <span className="font-mono font-semibold text-foreground">
              {totalHours.toFixed(1)}h
            </span>{" "}
            prévues
            {Math.abs(delta) >= 0.5 && (
              <span
                className={cn(
                  "ml-1.5 font-medium",
                  delta > 0 ? "text-rose-600" : "text-amber-600"
                )}
              >
                ({delta > 0 ? "+" : ""}
                {delta.toFixed(1)}h vs {dailyContract.toFixed(1)}h contrat)
              </span>
            )}
          </p>
        )}
      </header>

      {/* Cartes de blocs */}
      {isFullRest ? (
        <div className="rounded-2xl border border-border bg-card/60 px-5 py-8 text-center">
          <Coffee className="h-8 w-8 mx-auto text-amber-500/80" />
          <p className="mt-3 text-[14px] font-medium text-foreground">
            Repos
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Aucun créneau prévu ce jour. Profite !
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {blocks.map((b, i) => (
            <li key={`${b.from}-${i}`}>
              <BlockCard from={b.from} to={b.to} entry={b.entry} />
            </li>
          ))}
        </ul>
      )}

      {/* Footer : si présent uniquement absent → message rassurant */}
      {hasOnlyAbsence && (
        <div className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-center">
          <Sun className="h-4 w-4 inline-block text-amber-500 mr-1.5 align-text-bottom" />
          <span className="text-[12.5px] text-muted-foreground">
            Aucune heure de travail décomptée — bon repos !
          </span>
        </div>
      )}
    </section>
  );
}

/* ─── Carte de bloc ──────────────────────────────────────────────── */

function BlockCard({
  from,
  to,
  entry,
}: {
  from: string;
  to: string;
  entry: ScheduleEntryDTO;
}) {
  const duration = useMemo(() => {
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    const mins = th * 60 + tm - (fh * 60 + fm);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  }, [from, to]);

  // Cas TASK : carte colorée selon le poste
  if (entry.type === "TASK" && entry.taskCode) {
    const c = TASK_COLORS[entry.taskCode];
    return (
      <article
        className="rounded-2xl border-2 px-4 py-3.5 flex items-center gap-4 shadow-sm transition-transform active:scale-[0.99]"
        style={{
          borderColor: c.border,
          background: c.bg,
          color: c.text,
        }}
      >
        {/* Plage horaire en gros */}
        <div className="shrink-0">
          <div className="font-mono text-[15px] font-bold tabular-nums leading-tight">
            {from}
          </div>
          <div
            className="font-mono text-[15px] font-bold tabular-nums leading-tight opacity-90"
            aria-label={`jusqu'à ${to}`}
          >
            {to}
          </div>
        </div>

        {/* Séparateur visuel */}
        <div
          aria-hidden
          className="w-px self-stretch"
          style={{ background: c.text, opacity: 0.2 }}
        />

        {/* Détails poste */}
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold tracking-tight leading-tight">
            {TASK_LABELS[entry.taskCode]}
          </p>
          <p className="mt-0.5 text-[12px] opacity-80 leading-snug line-clamp-2">
            {TASK_DESCRIPTIONS[entry.taskCode]}
          </p>
        </div>

        {/* Durée du bloc */}
        <div className="shrink-0 font-mono text-[13px] font-semibold tabular-nums opacity-90">
          {duration}
        </div>
      </article>
    );
  }

  // Cas ABSENCE : carte avec hachures (pattern visuel cohérent avec la grille)
  if (entry.type === "ABSENCE" && entry.absenceCode) {
    const s = ABSENCE_STYLES[entry.absenceCode];
    return (
      <article
        className="rounded-2xl border-2 px-4 py-3.5 flex items-center gap-4"
        style={{
          borderColor: s.border,
          backgroundColor: s.bg,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.10) 0 1.5px, transparent 1.5px 8px)",
          color: s.text,
        }}
      >
        <div className="shrink-0">
          <div className="font-mono text-[15px] font-bold tabular-nums leading-tight">
            {from}
          </div>
          <div className="font-mono text-[15px] font-bold tabular-nums leading-tight opacity-90">
            {to}
          </div>
        </div>
        <div
          aria-hidden
          className="w-px self-stretch"
          style={{ background: s.text, opacity: 0.2 }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold tracking-tight">
            {ABSENCE_LABELS[entry.absenceCode]}
          </p>
        </div>
      </article>
    );
  }

  return null;
}
