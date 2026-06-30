"use client";

import { useMemo, useState } from "react";
import {
  ABSENCE_STYLES,
  WEEK_DAYS_SHORT,
  TIME_SLOTS,
  type EmployeeDTO,
} from "@/types";
import { SLOT_HOURS } from "@/types";
import type { EmployeeDayMap } from "@/lib/planning-utils";
import { weeklyTaskHours, staffingForSlot, staffingLevel } from "@/lib/planning-utils";
import { cn } from "@/lib/utils";

// Heures d'ouverture au public — créneaux sur lesquels on évalue l'effectif
// (cohérent avec l'analyse de couverture de PlanningView).
const OPEN_SLOTS = TIME_SLOTS.filter((s) => s >= "08:30" && s < "20:00");

// Filtre par rôle — libellés courts + ordre d'affichage des chips.
const ROLE_SHORT: Record<string, string> = {
  PHARMACIEN: "Pharma",
  PREPARATEUR: "Prépa",
  ETUDIANT: "Étud.",
  TITULAIRE: "Titu.",
  SECRETAIRE: "Secr.",
  BACK_OFFICE: "Back-off.",
  LIVREUR: "Livreur",
};
const ROLE_ORDER = [
  "PHARMACIEN",
  "PREPARATEUR",
  "ETUDIANT",
  "TITULAIRE",
  "SECRETAIRE",
  "BACK_OFFICE",
  "LIVREUR",
];

/**
 * Vue "Semaine" pour mobile : récap compact employés × 6 jours.
 *
 * Chaque case = heures comptabilisées du jour (ou une lettre d'absence
 * colorée : C congé, M maladie, A absent, F formation). On voit toute la
 * semaine d'un seul coup d'œil, sans scroll latéral. Taper un jour ouvre
 * la timeline de ce jour.
 */
export function MobileWeekView({
  employees,
  weekDates,
  dayNumbers,
  index,
  minStaff,
  currentEmployeeId,
  selectedDayIndex,
  onPickDay,
}: {
  employees: EmployeeDTO[];
  /** 6 dates ISO (Lun → Sam). */
  weekDates: string[];
  /** Numéros de jour (1..31) alignés sur weekDates, pour l'en-tête. */
  dayNumbers: number[];
  index: Map<string, EmployeeDayMap>;
  /** Seuil d'effectif comptoir mini (pour la ligne de pied de tableau). */
  minStaff: number;
  currentEmployeeId: string | null;
  selectedDayIndex: number;
  /** Ouvre la vue Jour sur l'index choisi. */
  onPickDay: (dayIndex: number) => void;
}) {
  // Effectif "comptoir" mini par jour : sur les heures d'ouverture, le plus
  // creux des effectifs (pharmaciens + préparateurs en poste). C'est le pire
  // moment de la journée → ce qui déclenche une alerte de sous-effectif.
  const counterStaffIds = useMemo(
    () =>
      employees
        .filter((e) => e.status === "PHARMACIEN" || e.status === "PREPARATEUR")
        .map((e) => e.id),
    [employees]
  );
  const dailyMinEff = useMemo(
    () =>
      weekDates.map((iso) => {
        let min = Infinity;
        for (const slot of OPEN_SLOTS) {
          const n = staffingForSlot(iso, slot, counterStaffIds, index);
          if (n < min) min = n;
        }
        return min === Infinity ? 0 : min;
      }),
    [weekDates, counterStaffIds, index]
  );
  // Trie : "moi" en premier, puis ordre d'affichage habituel.
  const rows = useMemo(
    () =>
      [...employees].sort((a, b) => {
        if (a.id === currentEmployeeId) return -1;
        if (b.id === currentEmployeeId) return 1;
        return a.displayOrder - b.displayOrder;
      }),
    [employees, currentEmployeeId]
  );

  // Pré-calcule heures/jour et total/semaine par employé en un seul passage.
  // Le chiffre d'une case = heures RÉELLEMENT travaillées (TASK uniquement) :
  // un congé ou un arrêt maladie, bien que rémunéré, doit se lire comme une
  // absence (lettre colorée) et non comme une journée travaillée — sinon on
  // ne distingue plus, d'un coup d'œil, qui bosse de qui est absent.
  const data = useMemo(() => {
    return rows.map((emp) => {
      const daily = weekDates.map((iso) => {
        const day = index.get(emp.id)?.get(iso);
        let workedSlots = 0;
        let absence: string | null = null;
        if (day) {
          for (const e of day.values()) {
            if (e.type === "TASK") workedSlots++;
            else if (e.type === "ABSENCE" && !absence) {
              absence = e.absenceCode ?? null;
            }
          }
        }
        const h = workedSlots * SLOT_HOURS;
        // La lettre d'absence prend le dessus seulement si aucun travail
        // réel ce jour-là (cas d'une demi-journée travaillée : on montre
        // les heures, plus parlantes).
        return { h, absence: h === 0 ? absence : null };
      });
      // Total semaine = heures comptabilisées (TASK + absences rémunérées),
      // cohérent avec l'en-tête de la grille desktop et le décompte contrat.
      const weekly = weeklyTaskHours(emp.id, weekDates, index);
      return { emp, daily, weekly, delta: weekly - emp.weeklyHours };
    });
  }, [rows, weekDates, index]);

  // Totaux équipe par jour : heures cumulées + nb de personnes au travail.
  const dailyTotals = useMemo(
    () =>
      weekDates.map((_, i) => {
        let hours = 0;
        let people = 0;
        for (const r of data) {
          const h = r.daily[i].h;
          if (h > 0) {
            hours += h;
            people += 1;
          }
        }
        return { hours, people };
      }),
    [data, weekDates]
  );

  const fmt = (h: number) =>
    h === 0 ? "" : Number.isInteger(h) ? String(h) : h.toFixed(1);

  // Lettre + couleur pour une absence (case sans heures).
  const absLetter: Record<string, string> = {
    CONGE: "C",
    MALADIE: "M",
    ABSENT: "A",
    FORMATION_ABS: "F",
  };

  // ─── Filtre par rôle (n'affecte que les lignes affichées ; les totaux et
  // l'effectif mini restent calculés sur l'équipe complète). ───
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());
  const rolesPresent = useMemo(() => {
    const set = new Set(employees.map((e) => e.status as string));
    return ROLE_ORDER.filter((s) => set.has(s));
  }, [employees]);
  const visibleData =
    roleFilter.size === 0 ? data : data.filter((r) => roleFilter.has(r.emp.status));
  const toggleRole = (s: string) =>
    setRoleFilter((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  return (
    <section aria-label="Récap de la semaine" className="space-y-2">
      {/* Filtre par rôle — chips horizontales */}
      {rolesPresent.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-0.5">
          <button
            type="button"
            onClick={() => setRoleFilter(new Set())}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border",
              roleFilter.size === 0
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            )}
          >
            Tous
          </button>
          {rolesPresent.map((s) => {
            const active = roleFilter.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleRole(s)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border",
                  active
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                )}
              >
                {ROLE_SHORT[s] ?? s}
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <table className="w-full border-collapse text-[12px]" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "84px" }} />
            {weekDates.map((d) => (
              <col key={d} />
            ))}
            <col style={{ width: "44px" }} />
          </colgroup>

          {/* En-tête jours — collant (reste visible au scroll) ; tap pour
              ouvrir la timeline du jour. Fond opaque (bg-muted) requis pour
              que les lignes ne défilent pas "à travers". */}
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 top-0 z-20 bg-muted px-2 py-2 text-left text-[10px] uppercase tracking-[0.06em] font-medium text-muted-foreground/70">
                Équipe
              </th>
              {weekDates.map((d, i) => (
                <th key={d} className="sticky top-0 z-10 bg-muted px-0.5 py-1.5">
                  <button
                    type="button"
                    onClick={() => onPickDay(i)}
                    className={cn(
                      "w-full flex flex-col items-center gap-0.5 rounded-md py-0.5 transition-colors",
                      i === selectedDayIndex
                        ? "bg-violet-100 dark:bg-violet-900/40"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-[0.04em] font-medium",
                        i === selectedDayIndex
                          ? "text-violet-700 dark:text-violet-300"
                          : "text-muted-foreground"
                      )}
                    >
                      {WEEK_DAYS_SHORT[i]}
                    </span>
                    <span
                      className={cn(
                        "text-[12px] font-semibold tabular-nums",
                        i === selectedDayIndex
                          ? "text-violet-700 dark:text-violet-300"
                          : "text-foreground"
                      )}
                    >
                      {String(dayNumbers[i]).padStart(2, "0")}
                    </span>
                  </button>
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-muted px-1 py-2 text-center text-[10px] uppercase tracking-[0.06em] font-medium text-muted-foreground/70">
                Tot
              </th>
            </tr>
          </thead>

          <tbody>
            {visibleData.map(({ emp, daily, weekly, delta }, rowIdx) => {
              const isMe = emp.id === currentEmployeeId;
              return (
                <tr
                  key={emp.id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    rowIdx % 2 === 1 && "bg-muted/20",
                    isMe && "bg-amber-50/60 dark:bg-amber-950/20"
                  )}
                >
                  {/* Nom employé (sticky) */}
                  <td
                    className={cn(
                      "sticky left-0 z-10 px-2 py-1.5",
                      isMe
                        ? "bg-amber-50/90 dark:bg-amber-950/40"
                        : rowIdx % 2 === 1
                          ? "bg-[#f7f7f8] dark:bg-zinc-900"
                          : "bg-card"
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: emp.displayColor }}
                        aria-hidden
                      />
                      <span className="truncate text-[12px] font-medium text-foreground">
                        {emp.firstName}
                      </span>
                    </div>
                  </td>

                  {/* Cases jours */}
                  {daily.map((cell, i) => {
                    if (cell.h > 0) {
                      // Remplissage proportionnel aux heures (réf. 8h = plein)
                      // → mini bar-chart : on repère d'un coup les journées
                      // chargées / légères et le rythme de chacun.
                      const fillPct = Math.min(100, (cell.h / 8) * 100);
                      return (
                        <td
                          key={i}
                          onClick={() => onPickDay(i)}
                          className={cn(
                            "cursor-pointer",
                            i === selectedDayIndex && "bg-violet-50/70 dark:bg-violet-950/30"
                          )}
                        >
                          <div className="relative h-7 flex items-center justify-center">
                            <span
                              aria-hidden
                              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[58%] rounded-t-sm bg-violet-400/30 dark:bg-violet-500/30"
                              style={{ height: `${fillPct}%` }}
                            />
                            <span className="relative font-mono tabular-nums text-[12px] text-foreground">
                              {fmt(cell.h)}
                            </span>
                          </div>
                        </td>
                      );
                    }
                    if (cell.absence) {
                      const s =
                        ABSENCE_STYLES[cell.absence as keyof typeof ABSENCE_STYLES];
                      return (
                        <td
                          key={i}
                          onClick={() => onPickDay(i)}
                          className={cn(
                            "text-center py-1 cursor-pointer",
                            i === selectedDayIndex && "bg-violet-50/70 dark:bg-violet-950/30"
                          )}
                        >
                          <span
                            className="inline-flex items-center justify-center h-5 w-5 rounded-md text-[10.5px] font-bold mx-auto"
                            style={{ backgroundColor: s.bg, color: s.text }}
                            title={cell.absence}
                          >
                            {absLetter[cell.absence] ?? "•"}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={i}
                        onClick={() => onPickDay(i)}
                        className={cn(
                          "text-center py-1.5 text-muted-foreground/30 cursor-pointer",
                          i === selectedDayIndex && "bg-violet-50/70 dark:bg-violet-950/30"
                        )}
                      >
                        ·
                      </td>
                    );
                  })}

                  {/* Total semaine + delta vs contrat */}
                  <td className="px-1 py-1.5 text-center">
                    <div className="font-mono text-[12px] font-semibold tabular-nums text-foreground leading-none">
                      {weekly % 1 === 0 ? weekly : weekly.toFixed(1)}
                    </div>
                    {Math.abs(delta) >= 0.5 && (
                      <div
                        className={cn(
                          "mt-0.5 text-[9px] font-medium leading-none tabular-nums",
                          delta > 0 ? "text-rose-600" : "text-amber-600"
                        )}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta % 1 === 0 ? delta : delta.toFixed(1)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Pied de tableau : totaux équipe + effectif mini par jour. */}
          <tfoot>
            {/* Total équipe : heures cumulées + nb de personnes au travail. */}
            <tr className="border-t-2 border-border bg-muted/40">
              <td className="sticky left-0 z-10 bg-muted/40 px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-semibold text-foreground/70">
                Total équipe
              </td>
              {dailyTotals.map((t, i) => (
                <td
                  key={i}
                  onClick={() => onPickDay(i)}
                  className={cn(
                    "text-center py-1.5 cursor-pointer leading-none",
                    i === selectedDayIndex && "bg-violet-50/70 dark:bg-violet-950/30"
                  )}
                  title={`${fmt(t.hours)}h cumulées · ${t.people} personne(s)`}
                >
                  <div className="font-mono text-[12px] font-bold tabular-nums text-foreground">
                    {t.hours > 0 ? `${fmt(t.hours)}` : "·"}
                  </div>
                  {t.people > 0 && (
                    <div className="mt-0.5 text-[8.5px] font-medium tabular-nums text-muted-foreground">
                      {t.people}p
                    </div>
                  )}
                </td>
              ))}
              <td className="px-1 py-1.5 text-center align-middle">
                <span className="font-mono text-[11px] font-bold tabular-nums text-foreground/80">
                  {(() => {
                    const sum = dailyTotals.reduce((s, t) => s + t.hours, 0);
                    return sum % 1 === 0 ? sum : sum.toFixed(1);
                  })()}
                </span>
              </td>
            </tr>
            <tr className="border-t border-border bg-muted/30">
              <td className="sticky left-0 z-10 bg-muted/30 px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-medium text-muted-foreground/80">
                Eff. mini
              </td>
              {dailyMinEff.map((eff, i) => {
                const level = staffingLevel(eff, minStaff);
                const pill =
                  level === "ok"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : level === "warning"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
                return (
                  <td
                    key={i}
                    onClick={() => onPickDay(i)}
                    className={cn(
                      "text-center py-1.5 cursor-pointer",
                      i === selectedDayIndex && "bg-violet-50/70 dark:bg-violet-950/30"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10.5px] font-bold tabular-nums",
                        pill
                      )}
                      title={`Effectif comptoir minimum ${eff} (seuil ${minStaff})`}
                    >
                      {eff}
                    </span>
                  </td>
                );
              })}
              <td className="px-1" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Légende compacte */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10.5px] text-muted-foreground">
        <span>Chiffre = heures du jour</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded text-[8px] font-bold" style={{ backgroundColor: ABSENCE_STYLES.CONGE.bg, color: ABSENCE_STYLES.CONGE.text }}>C</span>
          Congé
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded text-[8px] font-bold" style={{ backgroundColor: ABSENCE_STYLES.MALADIE.bg, color: ABSENCE_STYLES.MALADIE.text }}>M</span>
          Maladie
        </span>
        <span>Tot = heures semaine</span>
      </div>
    </section>
  );
}
