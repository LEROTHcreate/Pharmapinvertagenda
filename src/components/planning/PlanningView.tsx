"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Layers, Eye, Maximize2, Minimize2 } from "lucide-react";
import type { AbsenceCode, TaskCode, UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ABSENCE_LABELS, WEEK_DAYS, WEEK_DAYS_SHORT } from "@/types";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import {
  computeOvertimeCells,
  indexEntriesByEmployee,
  isoWeekNumber,
  toIsoDate,
  weekDays,
  weekTypeFor,
} from "@/lib/planning-utils";
import { TIME_SLOTS } from "@/types";
import { PlanningGrid, type CellKey, type ParsedCell as DnDParsedCell } from "@/components/planning/PlanningGrid";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { TASK_LABELS, STATUS_LABELS } from "@/types";
import { TaskSelector } from "@/components/planning/TaskSelector";
import { BulkTaskSelector } from "@/components/planning/BulkTaskSelector";
import type { ApplyScope } from "@/components/planning/ApplyScopeSelector";
import { ApplyTemplateButton } from "@/components/planning/ApplyTemplateButton";
import { EmployeeStatusFilter } from "@/components/planning/EmployeeStatusFilter";
import type { EmployeeStatus } from "@prisma/client";
import { CoverageWarnings } from "@/components/planning/CoverageWarnings";
import { analyzeCoverage } from "@/lib/coverage-analysis";
import { ViewModeSelector } from "@/components/planning/ViewModeSelector";
import { PrintButton } from "@/components/planning/PrintButton";
import { ExportXlsxButton } from "@/components/planning/ExportXlsxButton";
import { useToast } from "@/components/ui/toast";
import { holidaysIndexForDates } from "@/lib/holidays-fr";
import {
  AbsenceConflictDialog,
  type AbsenceConflict,
} from "@/components/planning/AbsenceConflictDialog";

type Selection = {
  employeeId: string;
  date: string;
  timeSlot: string;
} | null;

type ParsedCell = { employeeId: string; date: string; timeSlot: string };

function parseCellKey(k: CellKey): ParsedCell {
  const [employeeId, date, timeSlot] = k.split("|");
  return { employeeId, date, timeSlot };
}

/** Clé canonique d'une cellule (utilisée pour le diff optimiste). */
function entryKey(e: { employeeId: string; date: string; timeSlot: string }): string {
  return `${e.employeeId}|${e.date}|${e.timeSlot}`;
}

/**
 * Applique en local (optimistic) un upsert d'entrées. Seules les entrées
 * dont la date appartient à la semaine visible sont reflétées dans le state
 * (les autres semaines sont écrites côté serveur mais hors viewport).
 */
function applyEntriesUpdate(
  prev: ScheduleEntryDTO[],
  updates: Array<{
    employeeId: string;
    date: string;
    timeSlot: string;
    type: "TASK" | "ABSENCE";
    taskCode?: string | null;
    absenceCode?: string | null;
  }>,
  visibleDates: Set<string>
): ScheduleEntryDTO[] {
  const map = new Map<string, ScheduleEntryDTO>();
  prev.forEach((e) => map.set(entryKey(e), e));
  for (const u of updates) {
    if (!visibleDates.has(u.date)) continue;
    const k = entryKey(u);
    const existing = map.get(k);
    map.set(k, {
      id: existing?.id ?? `temp-${k}`,
      employeeId: u.employeeId,
      date: u.date,
      timeSlot: u.timeSlot,
      type: u.type,
      taskCode:
        u.type === "TASK" ? ((u.taskCode ?? null) as TaskCode | null) : null,
      absenceCode:
        u.type === "ABSENCE"
          ? ((u.absenceCode ?? null) as AbsenceCode | null)
          : null,
      notes: existing?.notes ?? null,
    });
  }
  return Array.from(map.values());
}

/** Pendant optimiste : suppression locale d'entrées. */
function applyEntriesDelete(
  prev: ScheduleEntryDTO[],
  deletes: Array<{ employeeId: string; date: string; timeSlot: string }>,
  visibleDates: Set<string>
): ScheduleEntryDTO[] {
  const keys = new Set(
    deletes
      .filter((d) => visibleDates.has(d.date))
      .map((d) => entryKey(d))
  );
  return prev.filter((e) => !keys.has(entryKey(e)));
}

export function PlanningView({
  initialWeekStart,
  employees,
  initialEntries,
  role,
  minStaff,
  currentEmployeeId,
}: {
  initialWeekStart: string;
  employees: EmployeeDTO[];
  initialEntries: ScheduleEntryDTO[];
  role: UserRole;
  minStaff: number;
  /** ID de l'Employee lié au compte connecté (null si admin sans liaison) */
  currentEmployeeId?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [entries, setEntries] = useState<ScheduleEntryDTO[]>(initialEntries);
  const [dayIndex, setDayIndex] = useState(() => {
    const today = new Date();
    const weekday = (today.getDay() + 6) % 7;
    return Math.min(5, Math.max(0, weekday));
  });
  const [selection, setSelection] = useState<Selection>(null);
  const [multiSelection, setMultiSelection] = useState<Set<CellKey>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState<Set<CellKey>>(new Set());
  // Filtre par statut : Set vide = aucun filtre (tous les collaborateurs visibles)
  const [statusFilter, setStatusFilter] = useState<Set<EmployeeStatus>>(new Set());

  // Liste filtrée passée à la grille — quand le filtre est vide, tout passe.
  const visibleEmployees = useMemo(
    () =>
      statusFilter.size === 0
        ? employees
        : employees.filter((e) => statusFilter.has(e.status)),
    [employees, statusFilter]
  );

  // ─── Dialog de conflit avec une absence approuvée ─────────────────
  // Quand le serveur renvoie 409 ABSENCE_CONFLICT, on stocke ici la liste
  // des conflits + 2 callbacks (forcer / annuler) pour que le user tranche.
  const [conflictPrompt, setConflictPrompt] = useState<{
    conflicts: AbsenceConflict[];
    onConfirm: () => Promise<void>;
    onCancel: () => void;
  } | null>(null);

  // Helper : POST /api/planning, intercepte 409 ABSENCE_CONFLICT.
  // Retour :
  //   { ok: true }                          → écrit en BDD
  //   { ok: false, conflicts }              → conflit, l'admin doit confirmer
  //   { ok: false, error }                  → autre erreur
  type PostResult =
    | { ok: true }
    | { ok: false; conflicts: AbsenceConflict[] }
    | { ok: false; error: string };

  async function postPlanningEntries(
    updates: Array<{
      employeeId: string;
      date: string;
      timeSlot: string;
      type: "TASK" | "ABSENCE";
      taskCode?: string | null;
      absenceCode?: string | null;
    }>,
    force = false
  ): Promise<PostResult> {
    try {
      const res = await fetch("/api/planning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: updates, force }),
      });
      if (res.ok) return { ok: true };
      const err = await res.json().catch(() => ({}));
      if (
        res.status === 409 &&
        err?.error === "ABSENCE_CONFLICT" &&
        Array.isArray(err.conflicts)
      ) {
        return { ok: false, conflicts: err.conflicts as AbsenceConflict[] };
      }
      return { ok: false, error: err?.error ?? "Erreur" };
    } catch {
      return { ok: false, error: "Réseau indisponible" };
    }
  }

  // Mode focus : cache la sidebar via un attribut data sur <body>
  useEffect(() => {
    if (focusMode) {
      document.body.dataset.focus = "true";
    } else {
      delete document.body.dataset.focus;
    }
    return () => {
      delete document.body.dataset.focus;
    };
  }, [focusMode]);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    setWeekStart(initialWeekStart);
  }, [initialWeekStart]);

  // Esc → vide la sélection multiple
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && multiSelection.size > 0) {
        setMultiSelection(new Set());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [multiSelection.size]);

  const monday = useMemo(() => new Date(`${weekStart}T00:00:00`), [weekStart]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const dayDates = useMemo(() => days.map(toIsoDate), [days]);
  const selectedDay = dayDates[dayIndex];
  const weekNumber = isoWeekNumber(monday);
  const weekKind = weekTypeFor(monday);

  const index = useMemo(() => indexEntriesByEmployee(entries), [entries]);

  const overtimeCells = useMemo(
    () => computeOvertimeCells(employees, dayDates, TIME_SLOTS, index),
    [employees, dayDates, index]
  );

  const absencesPerDay = useMemo(() => {
    return dayDates.map((iso) => {
      const set = new Set<string>();
      employees.forEach((emp) => {
        const day = index.get(emp.id)?.get(iso);
        if (!day) return;
        if (Array.from(day.values()).some((e) => e.type === "ABSENCE")) {
          set.add(emp.id);
        }
      });
      return set.size;
    });
  }, [dayDates, employees, index]);

  // Index des jours fériés FR pour la semaine affichée (très peu coûteux,
  // juste un lookup dans une map de 11 entrées par année).
  const holidaysIndex = useMemo(
    () => holidaysIndexForDates(dayDates),
    [dayDates]
  );
  const selectedDayHoliday = holidaysIndex.get(selectedDay) ?? null;

  /**
   * Manquements aux règles de couverture sur la semaine en cours :
   *  - Toujours ≥ 1 pharmacien sur chaque créneau ouvert
   *  - Toujours ≥ 2 préparateurs
   *  - Notifier si le livreur est absent (titulaires assurent les livraisons)
   */
  const coverageWarnings = useMemo(() => {
    // Créneaux d'ouverture standard (08:30 → 21:00) — exclut tôt matin
    // Horaires d'ouverture au public : 08:30 → 20:00
    const openSlots = TIME_SLOTS.filter((s) => s >= "08:30" && s < "20:00");
    return analyzeCoverage(employees, dayDates, index, openSlots);
  }, [employees, dayDates, index]);

  const absentToday = useMemo(() => {
    return employees
      .filter((emp) => {
        const day = index.get(emp.id)?.get(selectedDay);
        if (!day) return false;
        return Array.from(day.values()).some((e) => e.type === "ABSENCE");
      })
      .map((emp) => {
        const day = index.get(emp.id)?.get(selectedDay);
        const sample = day
          ? Array.from(day.values()).find((e) => e.type === "ABSENCE")
          : null;
        return {
          id: emp.id,
          name: `${emp.firstName} ${emp.lastName.charAt(0)}.`,
          absenceCode: sample?.absenceCode ?? null,
        };
      });
  }, [employees, index, selectedDay]);

  // Navigation semaine : un seul round-trip via router.replace (le serveur
  // re-fetch la nouvelle semaine et l'effet sur initialEntries/initialWeekStart
  // synchronise l'état local). On évite le double-fetch + refresh redondant.
  const navigateWeek = useCallback(
    (delta: number) => {
      const next = new Date(monday);
      next.setDate(next.getDate() + delta * 7);
      const iso = toIsoDate(next);
      setMultiSelection(new Set());
      router.replace(`?week=${iso}`, { scroll: false });
    },
    [monday, router]
  );

  const goToCurrentWeek = useCallback(() => {
    const today = startOfTodayWeek();
    // Sélectionne aussi le jour d'aujourd'hui (Lun=0..Sam=5, dim → samedi)
    const todayWeekday = Math.min(5, Math.max(0, (new Date().getDay() + 6) % 7));
    setDayIndex(todayWeekday);
    setMultiSelection(new Set());
    router.replace(`?week=${today}`, { scroll: false });
  }, [router]);

  // Quand on change de jour, on vide la sélection (cellules d'un autre jour ne sont plus visibles)
  useEffect(() => {
    setMultiSelection(new Set());
  }, [selectedDay]);

  async function refetchWeek(iso: string) {
    const res = await fetch(`/api/planning?weekStart=${iso}`);
    if (res.ok) {
      const data = (await res.json()) as { entries: ScheduleEntryDTO[] };
      setEntries(data.entries);
    }
  }

  // Stable pour ne pas casser le memo de PlanningGrid
  const handleCellClick = useCallback(
    (employeeId: string, date: string, timeSlot: string) => {
      if (role !== "ADMIN") return;
      setSelection({ employeeId, date, timeSlot });
    },
    [role]
  );

  /**
   * Génère la liste des dates auxquelles répliquer une modification, selon
   * la portée (scope) choisie par l'utilisateur.
   *  - "1" / "4" / "8" / "12" : N semaines consécutives à partir de isoDate
   *  - "year-pattern"          : toutes les semaines de même type (S1/S2)
   *                              jusqu'à la fin de l'année courante (cap 26)
   */
  function expandDates(isoDate: string, scope: ApplyScope): string[] {
    const base = new Date(`${isoDate}T00:00:00`);

    if (scope === "year-pattern") {
      // On cumule cette semaine + chaque semaine paire suivante (espacement 14j)
      // jusqu'à la fin de l'année calendaire, capé à 26 itérations (~6 mois).
      const out: string[] = [];
      const endOfYear = new Date(base.getFullYear(), 11, 31, 23, 59, 59);
      const cap = 26;
      for (let i = 0; i < cap; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i * 14); // +2 semaines à chaque itération
        if (d > endOfYear) break;
        out.push(toIsoDate(d));
      }
      return out;
    }

    const weeks = parseInt(scope, 10);
    const out: string[] = [];
    for (let w = 0; w < weeks; w++) {
      const d = new Date(base);
      d.setDate(d.getDate() + w * 7);
      out.push(toIsoDate(d));
    }
    return out;
  }

  /** Marque les cellules pour l'animation flash et les nettoie après 700ms */
  function flashCells(keys: CellKey[]) {
    setRecentlySaved((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
    setTimeout(() => {
      setRecentlySaved((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
    }, 750);
  }

  async function handleSave(payload: {
    type: "TASK" | "ABSENCE";
    taskCode?: string | null;
    absenceCode?: string | null;
    scope: ApplyScope;
  }) {
    if (!selection) return;
    const dates = expandDates(selection.date, payload.scope);
    const { scope: _s, ...basePayload } = payload;
    const sel = selection;

    const updates = dates.map((date) => ({
      employeeId: sel.employeeId,
      date,
      timeSlot: sel.timeSlot,
      type: basePayload.type,
      taskCode: basePayload.taskCode ?? null,
      absenceCode: basePayload.absenceCode ?? null,
    }));

    // ─── Optimistic update : on applique localement avant le POST ───
    const previousEntries = entries;
    const visibleDates = new Set(dayDates);
    setEntries((prev) => applyEntriesUpdate(prev, updates, visibleDates));
    flashCells([entryKey({ employeeId: sel.employeeId, date: sel.date, timeSlot: sel.timeSlot })]);
    setSelection(null);
    if (dates.length > 1) {
      toast({
        tone: "success",
        title: "Modification enregistrée",
        description: `Appliquée sur ${dates.length} semaines.`,
      });
    }

    // ─── POST en arrière-plan ; intercepte les conflits absence + revert si erreur ───
    const result = await postPlanningEntries(updates);
    if (result.ok) return;
    if ("conflicts" in result) {
      // L'admin doit décider : on garde l'optimistic, on ouvre le dialog
      setConflictPrompt({
        conflicts: result.conflicts,
        onConfirm: async () => {
          const r2 = await postPlanningEntries(updates, true);
          if (!("ok" in r2) || !r2.ok) {
            setEntries(previousEntries);
            const errMsg = "error" in r2 ? r2.error : "Erreur";
            toast({
              tone: "error",
              title: "Enregistrement annulé",
              description: errMsg,
            });
          }
          setConflictPrompt(null);
        },
        onCancel: () => {
          setEntries(previousEntries);
          setConflictPrompt(null);
          toast({
            tone: "info",
            title: "Modification annulée",
            description: "Le créneau d'absence approuvée est préservé.",
          });
        },
      });
      return;
    }
    setEntries(previousEntries);
    toast({
      tone: "error",
      title: "Enregistrement annulé",
      description: result.error,
    });
  }

  async function handleClear(payload: { scope: ApplyScope }) {
    if (!selection) return;
    const dates = expandDates(selection.date, payload.scope);
    const sel = selection;
    const deletes = dates.map((date) => ({
      employeeId: sel.employeeId,
      date,
      timeSlot: sel.timeSlot,
    }));

    // Optimistic delete
    const previousEntries = entries;
    const visibleDates = new Set(dayDates);
    setEntries((prev) => applyEntriesDelete(prev, deletes, visibleDates));
    setSelection(null);

    try {
      await Promise.all(
        dates.map((date) => {
          const params = new URLSearchParams({
            employeeId: sel.employeeId,
            date,
            timeSlot: sel.timeSlot,
          });
          return fetch(`/api/planning?${params.toString()}`, { method: "DELETE" });
        })
      );
    } catch {
      setEntries(previousEntries);
      toast({
        tone: "error",
        title: "Suppression annulée",
        description: "Erreur réseau, le créneau a été restauré.",
      });
    }
  }

  /* ---------- Drag & drop : déplacement d'une tâche ---------- */

  /**
   * Déplace une cellule TASK depuis `source` vers `target` (drop terminé).
   *  - Refuse si target est une absence (les absences validées sont protégées).
   *  - Refuse si la tâche n'est pas autorisée pour le statut du collaborateur
   *    cible (ex: poser un Mail sur un Pharmacien).
   *  - Si target est déjà une TASK, on l'écrase silencieusement (l'admin a vu
   *    la cellule en surbrillance violette pendant le hover, c'est explicite).
   *  - Optimistic + rollback en cas d'échec API ou conflit absence.
   */
  const handleMoveTask = useCallback(
    async (source: DnDParsedCell, target: DnDParsedCell) => {
      // Source TASK : on retrouve son taskCode dans entries
      const sourceEntry = entries.find(
        (e) =>
          e.employeeId === source.employeeId &&
          e.date === source.date &&
          e.timeSlot === source.timeSlot
      );
      if (!sourceEntry || sourceEntry.type !== "TASK" || !sourceEntry.taskCode) {
        return;
      }

      // Target absence : on refuse (le DnD désactive déjà le drop, mais on
      // double-check au cas où).
      const targetEntry = entries.find(
        (e) =>
          e.employeeId === target.employeeId &&
          e.date === target.date &&
          e.timeSlot === target.timeSlot
      );
      if (targetEntry?.type === "ABSENCE") {
        toast({
          tone: "error",
          title: "Déplacement refusé",
          description: "Impossible d'écraser une absence validée.",
        });
        return;
      }

      // Vérification rôle / poste côté client
      const targetEmp = employees.find((e) => e.id === target.employeeId);
      if (!targetEmp) return;
      if (!isTaskAllowed(targetEmp.status, sourceEntry.taskCode)) {
        toast({
          tone: "error",
          title: "Déplacement refusé",
          description: `Le poste ${TASK_LABELS[sourceEntry.taskCode]} n'est pas autorisé pour un ${STATUS_LABELS[targetEmp.status]}.`,
        });
        return;
      }

      // ─── Optimistic : on supprime la source ET on écrit la target ───
      const previousEntries = entries;
      const visibleDates = new Set(dayDates);
      setEntries((prev) => {
        // 1. supprime la source (uniquement si visible — applyEntriesDelete
        //    filtre déjà sur visibleDates, mais source/target sont sur le même
        //    jour visible par construction du DnD)
        const afterDelete = applyEntriesDelete(prev, [source], visibleDates);
        // 2. écrit la nouvelle entrée
        return applyEntriesUpdate(
          afterDelete,
          [
            {
              employeeId: target.employeeId,
              date: target.date,
              timeSlot: target.timeSlot,
              type: "TASK",
              taskCode: sourceEntry.taskCode,
              absenceCode: null,
            },
          ],
          visibleDates
        );
      });
      flashCells([
        entryKey({
          employeeId: target.employeeId,
          date: target.date,
          timeSlot: target.timeSlot,
        }),
      ]);

      // ─── Backend : DELETE source + POST target en parallèle ───
      const sourceParams = new URLSearchParams({
        employeeId: source.employeeId,
        date: source.date,
        timeSlot: source.timeSlot,
      });
      const [delRes, postRes] = await Promise.all([
        fetch(`/api/planning?${sourceParams.toString()}`, { method: "DELETE" }),
        postPlanningEntries([
          {
            employeeId: target.employeeId,
            date: target.date,
            timeSlot: target.timeSlot,
            type: "TASK",
            taskCode: sourceEntry.taskCode,
            absenceCode: null,
          },
        ]),
      ]);

      // Si l'écriture target échoue → on revert tout
      if (!postRes.ok) {
        setEntries(previousEntries);
        const errMsg =
          "error" in postRes
            ? postRes.error
            : "conflicts" in postRes
              ? "Conflit avec une absence approuvée."
              : "Erreur";
        toast({
          tone: "error",
          title: "Déplacement annulé",
          description: errMsg,
        });
        return;
      }
      // Si le DELETE échoue mais le POST a réussi → la source est encore en BDD,
      // on revert pour rester cohérent
      if (!delRes.ok) {
        setEntries(previousEntries);
        toast({
          tone: "error",
          title: "Déplacement annulé",
          description: "La suppression de la cellule d'origine a échoué.",
        });
      }
    },
    // postPlanningEntries est défini inline dans le composant et capturé par
    // closure ; on documente le warning plutôt que d'introduire du bruit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, employees, dayDates, toast]
  );

  /* ---------- Bulk multi-cell apply / clear ---------- */

  async function handleBulkApply(payload: {
    type: "TASK" | "ABSENCE";
    taskCode?: TaskCode | null;
    absenceCode?: AbsenceCode | null;
    scope: ApplyScope;
  }) {
    const cells = Array.from(multiSelection).map(parseCellKey);
    const { scope, ...basePayload } = payload;
    const expanded = cells.flatMap((c) =>
      expandDates(c.date, scope).map((date) => ({
        employeeId: c.employeeId,
        date,
        timeSlot: c.timeSlot,
        type: basePayload.type,
        taskCode: basePayload.taskCode ?? null,
        absenceCode: basePayload.absenceCode ?? null,
      }))
    );

    // Optimistic update
    const previousEntries = entries;
    const visibleDates = new Set(dayDates);
    setEntries((prev) => applyEntriesUpdate(prev, expanded, visibleDates));
    flashCells(cells.map((c) => entryKey(c)));
    toast({
      tone: "success",
      title: `${cells.length} créneau${cells.length > 1 ? "x" : ""} mis à jour`,
      description: scope !== "1" ? `Propagé sur la portée choisie.` : undefined,
    });
    setBulkOpen(false);
    setMultiSelection(new Set());

    const result = await postPlanningEntries(expanded);
    if (result.ok) return;
    if ("conflicts" in result) {
      setConflictPrompt({
        conflicts: result.conflicts,
        onConfirm: async () => {
          const r2 = await postPlanningEntries(expanded, true);
          if (!("ok" in r2) || !r2.ok) {
            setEntries(previousEntries);
            const errMsg = "error" in r2 ? r2.error : "Erreur";
            toast({
              tone: "error",
              title: "Enregistrement bulk annulé",
              description: errMsg,
            });
          }
          setConflictPrompt(null);
        },
        onCancel: () => {
          setEntries(previousEntries);
          setConflictPrompt(null);
          toast({
            tone: "info",
            title: "Modifications annulées",
            description: "Les créneaux d'absence approuvée sont préservés.",
          });
        },
      });
      return;
    }
    setEntries(previousEntries);
    toast({
      tone: "error",
      title: "Enregistrement bulk annulé",
      description: result.error,
    });
  }

  async function handleBulkClear(payload: { scope: ApplyScope }) {
    const cells = Array.from(multiSelection).map(parseCellKey);
    const expanded = cells.flatMap((c) =>
      expandDates(c.date, payload.scope).map((date) => ({
        employeeId: c.employeeId,
        date,
        timeSlot: c.timeSlot,
      }))
    );

    // Optimistic delete
    const previousEntries = entries;
    const visibleDates = new Set(dayDates);
    setEntries((prev) => applyEntriesDelete(prev, expanded, visibleDates));
    setBulkOpen(false);
    setMultiSelection(new Set());

    try {
      await Promise.all(
        expanded.map((c) => {
          const params = new URLSearchParams(c);
          return fetch(`/api/planning?${params.toString()}`, { method: "DELETE" });
        })
      );
    } catch {
      setEntries(previousEntries);
      toast({
        tone: "error",
        title: "Suppression bulk annulée",
        description: "Erreur réseau, créneaux restaurés.",
      });
    }
  }

  const selectedEmployee = useMemo(
    () => (selection ? employees.find((e) => e.id === selection.employeeId) ?? null : null),
    [selection, employees]
  );

  const selectedEntry = useMemo(() => {
    if (!selection) return null;
    return (
      entries.find(
        (e) =>
          e.employeeId === selection.employeeId &&
          e.date === selection.date &&
          e.timeSlot === selection.timeSlot
      ) ?? null
    );
  }, [selection, entries]);

  const selectedCells = useMemo(
    () => Array.from(multiSelection).map(parseCellKey),
    [multiSelection]
  );

  const isAdmin = role === "ADMIN";

  return (
    <div className="p-4 md:p-6 space-y-4 relative">
      {/* En-tête : titre + navigation, design Apple épuré */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-zinc-900">
              Planning
            </h1>
            <span className="text-[22px] md:text-[26px] font-semibold tracking-tight text-zinc-300">
              ·
            </span>
            <span className="text-[22px] md:text-[26px] font-semibold tracking-tight text-zinc-500">
              S{weekNumber}
            </span>
            <span className="ml-1 text-[10.5px] uppercase tracking-[0.08em] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
              {weekKind}
            </span>
            {!isAdmin && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] font-medium text-zinc-500"
                title="Lecture seule"
              >
                <Eye className="h-3 w-3" />
                Lecture
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-zinc-500 mt-0.5 tabular-nums">
            {days[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
            {" "}—{" "}
            {days[5].toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap no-print">
          <ViewModeSelector current="day" weekStart={weekStart} />
          {isAdmin && (
            <ApplyTemplateButton
              weekStart={weekStart}
              onApplied={() => refetchWeek(weekStart)}
            />
          )}
          {isAdmin && <ExportXlsxButton weekStart={weekStart} />}
          <EmployeeStatusFilter
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          <PrintButton />
          <button
            onClick={() => setFocusMode((v) => !v)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-card text-foreground/70 hover:bg-accent/50 transition-colors"
            title={focusMode ? "Quitter le mode focus" : "Mode focus (cache la barre latérale)"}
            aria-label="Mode focus"
          >
            {focusMode ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5 ml-1">
            <button
              onClick={() => navigateWeek(-1)}
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-accent/60 transition-colors"
              aria-label="Semaine précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToCurrentWeek}
              className="h-7 px-3 rounded-full text-[12px] font-medium text-foreground/80 hover:bg-accent/60 transition-colors"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => navigateWeek(1)}
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-accent/60 transition-colors"
              aria-label="Semaine suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Segmented control jour — façon iOS */}
      <div className="no-print">
        <div className="inline-flex w-full sm:w-auto items-center gap-0.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/60 p-1">
          {WEEK_DAYS.map((label, i) => {
            const date = days[i];
            const absCount = absencesPerDay[i];
            const active = i === dayIndex;
            const holiday = holidaysIndex.get(dayDates[i]) ?? null;
            return (
              <button
                key={i}
                onClick={() => setDayIndex(i)}
                title={holiday ? `${holiday.name} (jour férié)` : undefined}
                className={cn(
                  "relative flex-1 sm:flex-none flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-all min-w-[64px]",
                  active
                    ? "bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-foreground dark:shadow-none dark:ring-1 dark:ring-zinc-700"
                    : "text-muted-foreground hover:text-foreground",
                  // Jour férié : couleur rouge subtile pour signaler visuellement
                  holiday && (active ? "text-rose-700 dark:text-rose-300" : "text-rose-500 dark:text-rose-400")
                )}
              >
                <span className="text-[10px] uppercase tracking-[0.08em] font-medium">
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{WEEK_DAYS_SHORT[i]}</span>
                </span>
                <span className="text-[13px] font-semibold tabular-nums">
                  {date.getDate().toString().padStart(2, "0")}
                  <span className="text-zinc-300">/</span>
                  {(date.getMonth() + 1).toString().padStart(2, "0")}
                </span>
                {/* Pastille férié (gauche) — distincte de la pastille absences (droite) */}
                {holiday && (
                  <span
                    aria-hidden
                    className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-zinc-100/70"
                  />
                )}
                {absCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-[9px] font-semibold text-white inline-flex items-center justify-center tabular-nums"
                    aria-label={`${absCount} absent(s)`}
                  >
                    {absCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulle "Statut équipe" — admin uniquement (les collaborateurs ne
          gèrent pas la couverture, on évite de leur afficher des alertes
          sur lesquelles ils ne peuvent pas agir). */}
      {isAdmin && (absentToday.length > 0 || coverageWarnings.length > 0) && (
        <div className="rounded-2xl border border-border bg-card/80 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden />
            <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-zinc-600">
              Statut équipe — semaine en cours
            </span>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-2.5">
            {absentToday.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-[12px]">
                <span className="text-[10.5px] uppercase tracking-[0.08em] font-medium text-zinc-400">
                  Absents
                </span>
                {absentToday.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 px-2.5 py-0.5 tracking-tight"
                  >
                    {a.name}
                    {a.absenceCode && (
                      <span className="text-amber-600/70 text-[10px]">
                        · {ABSENCE_LABELS[a.absenceCode]}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
            <CoverageWarnings warnings={coverageWarnings} />
          </div>
        </div>
      )}

      {/* Bandeau "jour férié" — badge "FR" stylé (pas d'emoji drapeau qui
          rend mal sur Windows), alignement centré, design Apple-épuré. */}
      {selectedDayHoliday && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/60 px-4 py-3 text-[13px] text-rose-900">
          <span className="inline-flex items-center justify-center h-6 min-w-[28px] px-1.5 rounded-md bg-rose-500 text-white text-[10.5px] font-bold tracking-[0.04em] shrink-0">
            FR
          </span>
          <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
            <span className="font-semibold">{selectedDayHoliday.name}</span>
            <span className="text-[12px] text-rose-600/85">· jour férié</span>
          </div>
        </div>
      )}

      {/* Grille */}
      <PlanningGrid
        employees={visibleEmployees}
        date={selectedDay}
        weekDates={dayDates}
        index={index}
        canEdit={isAdmin}
        minStaff={minStaff}
        selection={multiSelection}
        onSelectionChange={setMultiSelection}
        onCellClick={handleCellClick}
        overtimeCells={overtimeCells}
        recentlySaved={recentlySaved}
        currentEmployeeId={currentEmployeeId ?? null}
        onMoveTask={isAdmin ? handleMoveTask : undefined}
      />

      {/* Modal d'édition unitaire */}
      {selection && selectedEmployee && (
        <TaskSelector
          open={!!selection}
          employee={selectedEmployee}
          date={selection.date}
          timeSlot={selection.timeSlot}
          currentEntry={selectedEntry}
          weekKind={weekKind}
          onClose={() => setSelection(null)}
          onSave={handleSave}
          onClear={handleClear}
        />
      )}

      {/* Modal d'édition en bulk */}
      <BulkTaskSelector
        open={bulkOpen}
        cells={selectedCells}
        employees={employees}
        weekKind={weekKind}
        onClose={() => setBulkOpen(false)}
        onApply={handleBulkApply}
        onClearAll={handleBulkClear}
      />

      {/* Dialog de conflit absence approuvée */}
      <AbsenceConflictDialog
        open={conflictPrompt !== null}
        conflicts={conflictPrompt?.conflicts ?? []}
        onConfirm={async () => {
          if (conflictPrompt) await conflictPrompt.onConfirm();
        }}
        onCancel={() => conflictPrompt?.onCancel()}
      />

      {/* Barre d'action flottante (sélection multi) — glass Apple-style */}
      {isAdmin && multiSelection.size > 0 && (
        <div className="no-print safe-bottom fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-card/85 backdrop-blur-xl shadow-[0_4px_24px_-2px_rgba(0,0,0,0.12),0_2px_6px_-1px_rgba(0,0,0,0.06)] pl-3.5 pr-1 py-1 animate-in fade-in slide-in-from-bottom-4">
          <Layers className="h-3.5 w-3.5 text-violet-600 shrink-0" />
          <span className="text-[12.5px] tracking-tight">
            <span className="font-semibold tabular-nums">{multiSelection.size}</span>{" "}
            <span className="text-zinc-500">
              sélectionné{multiSelection.size > 1 ? "s" : ""}
            </span>
          </span>
          <button
            onClick={() => setBulkOpen(true)}
            className="ml-1 h-7 px-3 rounded-full bg-zinc-900 text-white text-[12px] font-medium hover:bg-zinc-800 transition-colors"
          >
            Appliquer un poste
          </button>
          <button
            onClick={() => setMultiSelection(new Set())}
            className="h-7 w-7 inline-flex items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 transition-colors"
            aria-label="Annuler la sélection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function startOfTodayWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
