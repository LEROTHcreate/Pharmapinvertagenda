"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CalendarOff } from "lucide-react";
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
import { staffingForSlot, staffingLevel } from "@/lib/planning-utils";
import { cn } from "@/lib/utils";

/**
 * Vue mobile "Jour" repensée — une frise horizontale (type Gantt) par personne.
 *
 * Chaque employé est une ligne ; ses créneaux sont des barres colorées posées
 * sur l'axe des heures. Toute la journée tient dans la largeur de l'écran
 * (aucun scroll horizontal), et on scrolle verticalement parmi les gens.
 *
 * La ligne de l'utilisateur connecté est épinglée en haut ("Moi"), suivie de
 * l'équipe : on voit SON planning ET celui de l'équipe dans le même écran,
 * d'un seul coup d'œil. Tap sur une ligne → détail texte des créneaux.
 */

type RawEntry = {
  type: string;
  taskCode: string | null;
  absenceCode: string | null;
};
type Block = { fromMin: number; toMin: number; entry: RawEntry };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fmtMin = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Compacte les créneaux 30 min contigus (même tâche/absence) en blocs. */
function buildBlocks(
  empId: string,
  date: string,
  index: Map<string, EmployeeDayMap>
): Block[] {
  const day = index.get(empId)?.get(date);
  if (!day) return [];
  const out: Block[] = [];
  let cur: { fromMin: number; entry: RawEntry } | null = null;
  for (const slot of TIME_SLOTS) {
    const e = (day.get(slot) ?? null) as RawEntry | null;
    const same =
      cur &&
      e &&
      e.type === cur.entry.type &&
      e.taskCode === cur.entry.taskCode &&
      e.absenceCode === cur.entry.absenceCode;
    if (same) continue;
    if (cur) out.push({ fromMin: cur.fromMin, toMin: toMin(slot), entry: cur.entry });
    cur = e ? { fromMin: toMin(slot), entry: e } : null;
  }
  if (cur) {
    const last = TIME_SLOTS[TIME_SLOTS.length - 1];
    out.push({ fromMin: cur.fromMin, toMin: toMin(last) + 30, entry: cur.entry });
  }
  return out;
}

const COUNTER = new Set(["PHARMACIEN", "PREPARATEUR"]);

// Libellés courts pour les chips de filtre par rôle.
const ROLE_SHORT: Record<string, string> = {
  PHARMACIEN: "Pharma",
  PREPARATEUR: "Prépa",
  ETUDIANT: "Étud.",
  TITULAIRE: "Titu.",
  SECRETAIRE: "Secr.",
  BACK_OFFICE: "Back-off.",
  LIVREUR: "Livreur",
};

export function MobileTeamGantt({
  employees,
  date,
  index,
  minStaff,
  currentEmployeeId,
}: {
  employees: EmployeeDTO[];
  date: string;
  index: Map<string, EmployeeDayMap>;
  minStaff: number;
  currentEmployeeId: string | null;
}) {
  // Blocs par employé + bornes de la fenêtre horaire affichée.
  const { rows, winStart, winEnd } = useMemo(() => {
    const rows = employees.map((emp) => {
      const blocks = buildBlocks(emp.id, date, index);
      const workMin = blocks
        .filter((b) => b.entry.type === "TASK")
        .reduce((s, b) => s + (b.toMin - b.fromMin), 0);
      const firstStart = blocks.length ? Math.min(...blocks.map((b) => b.fromMin)) : Infinity;
      const hasTask = blocks.some((b) => b.entry.type === "TASK");
      const absence = blocks.find((b) => b.entry.type === "ABSENCE")?.entry.absenceCode ?? null;
      return { emp, blocks, workMin, firstStart, hasTask, absence };
    });
    // Fenêtre : du premier créneau au dernier, arrondie à l'heure. Défaut 8h-20h.
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows)
      for (const b of r.blocks) {
        if (b.fromMin < lo) lo = b.fromMin;
        if (b.toMin > hi) hi = b.toMin;
      }
    if (!isFinite(lo)) {
      lo = 8 * 60;
      hi = 20 * 60;
    } else {
      lo = Math.floor(lo / 60) * 60;
      hi = Math.ceil(hi / 60) * 60;
    }
    return { rows, winStart: lo, winEnd: hi };
  }, [employees, date, index]);

  const winDur = Math.max(60, winEnd - winStart);
  const pos = (min: number) =>
    Math.max(0, Math.min(100, ((min - winStart) / winDur) * 100));

  // Graduations toutes les 2h.
  const ticks = useMemo(() => {
    const out: number[] = [];
    const startH = Math.ceil(winStart / 60);
    for (let h = startH; h * 60 <= winEnd; h += 2) out.push(h * 60);
    return out;
  }, [winStart, winEnd]);

  // Bande effectif comptoir : segments contigus de même niveau.
  const counterIds = useMemo(
    () => employees.filter((e) => COUNTER.has(e.status)).map((e) => e.id),
    [employees]
  );
  // Tous les ids → les REMPLACEMENT comptent quel que soit le rôle.
  const allIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const effSegments = useMemo(() => {
    const slots = TIME_SLOTS.filter((s) => {
      const m = toMin(s);
      return m >= winStart && m < winEnd;
    });
    const segs: Array<{ fromMin: number; toMin: number; level: string; n: number }> = [];
    let cur: { fromMin: number; level: string; n: number } | null = null;
    for (const s of slots) {
      const n = staffingForSlot(date, s, counterIds, index, allIds);
      const level = staffingLevel(n, minStaff);
      if (cur && cur.level === level) continue;
      if (cur) segs.push({ ...cur, toMin: toMin(s) });
      cur = { fromMin: toMin(s), level, n };
    }
    if (cur && slots.length) segs.push({ ...cur, toMin: toMin(slots[slots.length - 1]) + 30 });
    return segs;
  }, [date, counterIds, allIds, index, minStaff, winStart, winEnd]);

  // Horloge auto-rafraîchie chaque minute. `null` jusqu'au montage côté client
  // (évite tout décalage d'hydratation SSR) ; idéal pour une tablette de
  // comptoir laissée allumée — "En ce moment" et la ligne "maintenant" suivent.
  const [nowDate, setNowDate] = useState<Date | null>(null);
  useEffect(() => {
    setNowDate(new Date());
    const id = setInterval(() => setNowDate(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Heure courante en minutes (si on regarde aujourd'hui), sinon null.
  const nowMin = useMemo(() => {
    if (!nowDate) return null;
    const todayIso = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-${String(nowDate.getDate()).padStart(2, "0")}`;
    if (todayIso !== date) return null;
    return nowDate.getHours() * 60 + nowDate.getMinutes();
  }, [date, nowDate]);

  // "En ce moment" : qui travaille au créneau courant (aujourd'hui uniquement,
  // dans les horaires affichés). Donne le coup d'œil "qui est là, là, tout de
  // suite" sans avoir à lire les barres.
  const nowSnapshot = useMemo(() => {
    if (nowMin == null || nowMin < winStart || nowMin >= winEnd) return null;
    const label = fmtMin(Math.floor(nowMin / 30) * 30);
    const working: Array<{ emp: EmployeeDTO; taskCode: string }> = [];
    for (const r of rows) {
      const b = r.blocks.find(
        (b) => b.entry.type === "TASK" && b.fromMin <= nowMin && nowMin < b.toMin
      );
      if (b && b.entry.taskCode) working.push({ emp: r.emp, taskCode: b.entry.taskCode });
    }
    const counterEff = working.filter((w) => COUNTER.has(w.emp.status)).length;
    // Ma situation : poste en cours + fin du bloc.
    let mine: { taskCode: string; until: number } | null = null;
    if (currentEmployeeId) {
      const meRow = rows.find((r) => r.emp.id === currentEmployeeId);
      const b = meRow?.blocks.find(
        (b) => b.entry.type === "TASK" && b.fromMin <= nowMin && nowMin < b.toMin
      );
      if (b && b.entry.taskCode) mine = { taskCode: b.entry.taskCode, until: b.toMin };
    }
    return { label, working, counterEff, mine };
  }, [nowMin, winStart, winEnd, rows, currentEmployeeId]);

  // Filtre par rôle (vide = tout). N'affecte QUE l'affichage des lignes équipe ;
  // l'effectif et "en ce moment" restent calculés sur l'équipe complète.
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());

  // Tri : "moi" d'abord, puis présents (par heure de début), absents à la fin.
  const me = rows.find((r) => r.emp.id === currentEmployeeId) ?? null;
  const team = rows
    .filter((r) => r.emp.id !== currentEmployeeId && r.blocks.length > 0)
    .sort((a, b) => {
      if (a.hasTask !== b.hasTask) return a.hasTask ? -1 : 1;
      return a.firstStart - b.firstStart;
    });

  // Rôles réellement présents ce jour (pour ne proposer que des filtres utiles).
  const rolesPresent = useMemo(() => {
    const order: string[] = [
      "PHARMACIEN",
      "PREPARATEUR",
      "ETUDIANT",
      "TITULAIRE",
      "SECRETAIRE",
      "BACK_OFFICE",
      "LIVREUR",
    ];
    const set = new Set(team.map((r) => r.emp.status as string));
    return order.filter((s) => set.has(s));
  }, [team]);

  const visibleTeam =
    roleFilter.size === 0 ? team : team.filter((r) => roleFilter.has(r.emp.status));

  const toggleRole = (s: string) =>
    setRoleFilter((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  const presentCount = rows.filter((r) => r.hasTask).length;

  // Employés sans aucun créneau ce jour-là (ni travail ni absence) → "au repos".
  // Listés en bas pour une visibilité complète de l'équipe (qui est off).
  const offToday = rows.filter(
    (r) => r.blocks.length === 0 && r.emp.id !== currentEmployeeId
  );

  // Postes présents ce jour → légende.
  const tasksToday = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows)
      for (const b of r.blocks)
        if (b.entry.type === "TASK" && b.entry.taskCode) set.add(b.entry.taskCode);
    return Array.from(set);
  }, [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const NAME_W = "72px";

  // État vide : aucune entrée (ni travail ni absence) pour personne ce jour.
  const hasAnyEntry = rows.some((r) => r.blocks.length > 0);
  if (!hasAnyEntry) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-10 text-center">
        <CalendarOff className="h-8 w-8 mx-auto text-muted-foreground/50" />
        <p className="mt-3 text-[14px] font-medium text-foreground">
          Aucun planning ce jour
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Personne n'est encore positionné sur cette journée.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Planning de l'équipe — journée" className="space-y-2">
      {/* En-tête compact */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{presentCount}</span>{" "}
          au travail · <span className="tabular-nums">{fmtMin(winStart)}</span>–
          <span className="tabular-nums">{fmtMin(winEnd)}</span>
        </p>
        <span className="text-[10px] uppercase tracking-[0.07em] text-muted-foreground/60">
          eff. min {minStaff}
        </span>
      </div>

      {/* Filtre par rôle — chips horizontales (n'affecte que l'affichage). */}
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

      {/* En ce moment (aujourd'hui, dans les horaires) */}
      {nowSnapshot && (
        <div className="rounded-xl border border-violet-200/70 bg-violet-50/50 dark:border-violet-900/40 dark:bg-violet-950/20 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-violet-700 dark:text-violet-300">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" aria-hidden />
              En ce moment · {nowSnapshot.label}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                staffingLevel(nowSnapshot.counterEff, minStaff) === "ok"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : staffingLevel(nowSnapshot.counterEff, minStaff) === "warning"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
              )}
              title="Effectif comptoir actuel"
            >
              {nowSnapshot.counterEff} cptr
            </span>
          </div>
          {nowSnapshot.working.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {nowSnapshot.working.map((w) => {
                const c = TASK_COLORS[w.taskCode as keyof typeof TASK_COLORS];
                return (
                  <span
                    key={w.emp.id}
                    className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-none border"
                    style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                  >
                    <span className="font-semibold">{w.emp.firstName}</span>
                    <span className="opacity-75 text-[9.5px]">
                      {TASK_LABELS[w.taskCode as keyof typeof TASK_LABELS]}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-[11.5px] text-rose-600 dark:text-rose-400 font-medium">
              Personne en poste actuellement.
            </p>
          )}
          {nowSnapshot.mine && (
            <p className="mt-1.5 text-[11.5px] text-violet-800 dark:text-violet-200">
              <span className="font-semibold">Toi</span> :{" "}
              {TASK_LABELS[nowSnapshot.mine.taskCode as keyof typeof TASK_LABELS]} jusqu'à{" "}
              <span className="font-mono tabular-nums">{fmtMin(nowSnapshot.mine.until)}</span>
            </p>
          )}
        </div>
      )}

      {/* Règle horaire + bande effectif (alignées sur les pistes).
          `sticky top-0` : reste figée en haut quand on scrolle la liste des
          personnes → on garde toujours le repère horaire + l'effectif. */}
      <div className="sticky top-0 z-30 rounded-xl border border-border bg-card px-2 py-2 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.12)]">
        <div className="flex items-center">
          <div className="shrink-0" style={{ width: NAME_W }} />
          <div className="relative flex-1 h-4">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 text-[9px] font-mono text-muted-foreground/70 tabular-nums"
                style={{ left: `${pos(t)}%` }}
              >
                {Math.floor(t / 60)}h
              </span>
            ))}
          </div>
          <div className="shrink-0 w-[34px]" />
        </div>

        {/* Bande effectif */}
        <div className="mt-0.5 flex items-center">
          <div
            className="shrink-0 text-[9px] uppercase tracking-[0.06em] text-muted-foreground/70 text-right pr-1.5"
            style={{ width: NAME_W }}
          >
            Effectif
          </div>
          <div className="relative flex-1 h-3 rounded-full bg-muted/50 overflow-hidden">
            {effSegments.map((s, i) => {
              const c =
                s.level === "ok"
                  ? "#10b981"
                  : s.level === "warning"
                    ? "#f59e0b"
                    : "#f43f5e";
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${pos(s.fromMin)}%`,
                    width: `${pos(s.toMin) - pos(s.fromMin)}%`,
                    backgroundColor: c,
                    opacity: 0.85,
                  }}
                  title={`${s.n} au comptoir`}
                />
              );
            })}
          </div>
          <div className="shrink-0 w-[34px]" />
        </div>
      </div>

      {/* MOI */}
      {me && (
        <div>
          <p className="px-1 pb-1 text-[10px] uppercase tracking-[0.08em] font-semibold text-violet-600 dark:text-violet-300">
            Moi
          </p>
          <GanttRow
            row={me}
            pos={pos}
            ticks={ticks}
            nowMin={nowMin}
            nameWidth={NAME_W}
            highlight
            expanded={expanded.has(me.emp.id)}
            onToggle={() => toggle(me.emp.id)}
          />
        </div>
      )}

      {/* ÉQUIPE */}
      {team.length > 0 && (
        <div>
          <p className="px-1 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70">
            Équipe
            {roleFilter.size > 0 && (
              <span className="ml-1 normal-case tracking-normal text-muted-foreground/50">
                · {visibleTeam.length}/{team.length}
              </span>
            )}
          </p>
          {visibleTeam.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-muted-foreground">
              Personne pour ce filtre.
            </p>
          ) : (
          <ul className="space-y-1">
            {visibleTeam.map((r) => (
              <li key={r.emp.id}>
                <GanttRow
                  row={r}
                  pos={pos}
                  ticks={ticks}
                  nowMin={nowMin}
                  nameWidth={NAME_W}
                  expanded={expanded.has(r.emp.id)}
                  onToggle={() => toggle(r.emp.id)}
                />
              </li>
            ))}
          </ul>
          )}
        </div>
      )}

      {/* Au repos aujourd'hui */}
      {offToday.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.07em] font-medium text-muted-foreground/70 mr-0.5">
            Au repos
          </span>
          {offToday.map((r) => (
            <span
              key={r.emp.id}
              className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground"
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0 opacity-50"
                style={{ backgroundColor: r.emp.displayColor }}
                aria-hidden
              />
              {r.emp.firstName}
            </span>
          ))}
        </div>
      )}

      {/* Légende des postes du jour */}
      {tasksToday.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 pt-1">
          {tasksToday.map((tc) => {
            const c = TASK_COLORS[tc as keyof typeof TASK_COLORS];
            return (
              <span key={tc} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
                />
                {TASK_LABELS[tc as keyof typeof TASK_LABELS]}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ─── Une ligne (personne) ──────────────────────────────────────────── */

type RowData = {
  emp: EmployeeDTO;
  blocks: Block[];
  workMin: number;
  hasTask: boolean;
  absence: string | null;
};

function GanttRow({
  row,
  pos,
  ticks,
  nowMin,
  nameWidth,
  highlight,
  expanded,
  onToggle,
}: {
  row: RowData;
  pos: (min: number) => number;
  ticks: number[];
  nowMin: number | null;
  nameWidth: string;
  highlight?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { emp, blocks, workMin } = row;
  const hours = workMin / 60;

  return (
    <div
      className={cn(
        "rounded-xl border px-2 py-1.5 transition-colors",
        highlight
          ? "border-violet-300 bg-violet-50/50 dark:bg-violet-950/20"
          : "border-border bg-card"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1 text-left"
        aria-expanded={expanded}
      >
        {/* Nom + rôle */}
        <div className="shrink-0 min-w-0" style={{ width: nameWidth }}>
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: emp.displayColor }}
              aria-hidden
            />
            <span className="truncate text-[12px] font-semibold text-foreground leading-tight">
              {emp.firstName}
            </span>
          </div>
          <span className="block truncate text-[9px] uppercase tracking-[0.03em] text-muted-foreground/70 leading-tight">
            {STATUS_LABELS[emp.status]}
          </span>
        </div>

        {/* Piste / barres */}
        <div className="relative flex-1 h-7 rounded-md bg-muted/40 dark:bg-zinc-800/50 overflow-hidden">
          {/* graduations */}
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-border/60"
              style={{ left: `${pos(t)}%` }}
            />
          ))}
          {/* ligne "maintenant" */}
          {nowMin != null && (
            <div
              aria-hidden
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500/90 z-10"
              style={{ left: `${pos(nowMin)}%` }}
            />
          )}
          {/* blocs */}
          {blocks.map((b, i) => {
            const left = pos(b.fromMin);
            const width = pos(b.toMin) - left;
            if (b.entry.type === "TASK" && b.entry.taskCode) {
              const c = TASK_COLORS[b.entry.taskCode as keyof typeof TASK_COLORS];
              const label = TASK_LABELS[b.entry.taskCode as keyof typeof TASK_LABELS];
              return (
                <div
                  key={i}
                  className="absolute top-0.5 bottom-0.5 rounded flex items-center justify-center overflow-hidden border"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: c.bg,
                    borderColor: c.border,
                  }}
                  title={`${label} · ${fmtMin(b.fromMin)}–${fmtMin(b.toMin)}`}
                >
                  {width >= 16 && (
                    <span
                      className="px-0.5 text-[9px] font-semibold leading-none truncate"
                      style={{ color: c.text }}
                    >
                      {label}
                    </span>
                  )}
                </div>
              );
            }
            if (b.entry.type === "ABSENCE" && b.entry.absenceCode) {
              const s = ABSENCE_STYLES[b.entry.absenceCode as keyof typeof ABSENCE_STYLES];
              return (
                <div
                  key={i}
                  className="absolute top-0.5 bottom-0.5 rounded flex items-center justify-center overflow-hidden border"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: s.bg,
                    borderColor: s.border,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0 1.5px, transparent 1.5px 6px)",
                  }}
                  title={`${ABSENCE_LABELS[b.entry.absenceCode as keyof typeof ABSENCE_LABELS]}`}
                >
                  {width >= 16 && (
                    <span
                      className="px-0.5 text-[8.5px] font-bold uppercase leading-none truncate"
                      style={{ color: s.text }}
                    >
                      {ABSENCE_LABELS[b.entry.absenceCode as keyof typeof ABSENCE_LABELS]}
                    </span>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>

        {/* Total heures + chevron */}
        <div className="shrink-0 w-[34px] flex flex-col items-end">
          <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground leading-none">
            {hours > 0 ? `${hours % 1 === 0 ? hours : hours.toFixed(1)}h` : "—"}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground/50 transition-transform mt-0.5",
              expanded && "rotate-180"
            )}
            aria-hidden
          />
        </div>
      </button>

      {/* Détail (déplié) */}
      {expanded && (
        <ul className="mt-1.5 ml-[72px] space-y-0.5 border-t border-border/60 pt-1.5">
          {blocks.length === 0 && (
            <li className="text-[11px] text-muted-foreground">Repos — aucun créneau.</li>
          )}
          {blocks.map((b, i) => {
            const isTask = b.entry.type === "TASK" && b.entry.taskCode;
            const c = isTask ? TASK_COLORS[b.entry.taskCode as keyof typeof TASK_COLORS] : null;
            const sStyle =
              !isTask && b.entry.absenceCode
                ? ABSENCE_STYLES[b.entry.absenceCode as keyof typeof ABSENCE_STYLES]
                : null;
            const label = isTask
              ? TASK_LABELS[b.entry.taskCode as keyof typeof TASK_LABELS]
              : b.entry.absenceCode
                ? ABSENCE_LABELS[b.entry.absenceCode as keyof typeof ABSENCE_LABELS]
                : "";
            return (
              <li key={i} className="flex items-center gap-2 text-[11.5px]">
                <span className="font-mono tabular-nums text-muted-foreground w-[86px] shrink-0">
                  {fmtMin(b.fromMin)}–{fmtMin(b.toMin)}
                </span>
                <span
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                  style={{
                    backgroundColor: (c?.bg ?? sStyle?.bg) || undefined,
                    color: (c?.text ?? sStyle?.text) || undefined,
                  }}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
