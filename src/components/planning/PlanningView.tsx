"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CalendarDays, ChevronLeft, ChevronRight, X, Layers, Eye, Lock, Unlock, Trash2, ClipboardCopy, ClipboardPaste, PartyPopper } from "lucide-react";
import type { AbsenceCode, TaskCode, UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { WEEK_DAYS, WEEK_DAYS_SHORT } from "@/types";
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
import type { CellKey, ParsedCell as DnDParsedCell } from "@/components/planning/PlanningGrid";
import { MyDayView } from "@/components/planning/MyDayView";
import { MobileTeamGantt } from "@/components/planning/MobileTeamGantt";
import { MobileWeekView } from "@/components/planning/MobileWeekView";
import { isTaskAllowed } from "@/lib/role-task-rules";
import { canEditPlanning } from "@/lib/permissions";
import { TASK_LABELS, STATUS_LABELS } from "@/types";
import type { ApplyScope } from "@/components/planning/ApplyScopeSelector";
import { ApplyTemplateButton } from "@/components/planning/ApplyTemplateButton";
import { AutoFillButton } from "@/components/planning/AutoFillButton";
import { EmployeeStatusFilter } from "@/components/planning/EmployeeStatusFilter";
import { useMetierFilter } from "@/components/planning/useMetierFilter";
import { appendCurrentMetier } from "@/lib/metier-filter";
import { ViewModeSelector } from "@/components/planning/ViewModeSelector";
import { PrintButton } from "@/components/planning/PrintButton";
import { useToast } from "@/components/ui/toast";
import { holidaysIndexForDates } from "@/lib/holidays-fr";
import type { AbsenceConflict } from "@/components/planning/AbsenceConflictDialog";
import { usePlanningStore } from "@/store/planning-store";
import { entryKey, parseCellKey } from "@/lib/cell-keys";
import type { TeamEventType } from "@/validators/team-event";

// Modals lourds chargés à la demande (ouverture seulement) → allègent le
// bundle initial de /planning + accélèrent l'hydratation de la page.
const TaskSelector = dynamic(
  () => import("@/components/planning/TaskSelector").then((m) => m.TaskSelector),
  { ssr: false }
);
const BulkTaskSelector = dynamic(
  () =>
    import("@/components/planning/BulkTaskSelector").then((m) => m.BulkTaskSelector),
  { ssr: false }
);
const AbsenceConflictDialog = dynamic(
  () =>
    import("@/components/planning/AbsenceConflictDialog").then(
      (m) => m.AbsenceConflictDialog
    ),
  { ssr: false }
);

// Grille desktop (~1300 lignes + dnd-kit) : chargée à la demande UNIQUEMENT sur
// desktop (cf. gate `isDesktopWidth`) → le mobile ne télécharge/parse plus ce
// gros chunk, allègement majeur du bundle initial de /planning sur mobile.
const PlanningGrid = dynamic(
  () => import("@/components/planning/PlanningGrid").then((m) => m.PlanningGrid),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />
    ),
  }
);

type Selection = {
  employeeId: string;
  date: string;
  timeSlot: string;
} | null;

// parseCellKey / entryKey sont centralisés dans @/lib/cell-keys (importés ci-dessus).

/**
 * Applique en local (optimistic) un upsert d'entrées. Seules les entrées
 * dont la date appartient à la semaine visible sont reflétées dans le state
 * (les autres semaines sont écrites côté serveur mais hors viewport).
 */
/**
 * Élément du presse-papiers du planning : contenu d'une case, VOLONTAIREMENT
 * jour-agnostique (employé + horaire + poste, sans la date). Le collage
 * réapplique le poste au même employé/horaire sur le JOUR AFFICHÉ.
 */
type ClipEntry = {
  employeeId: string;
  timeSlot: string;
  type: "TASK" | "ABSENCE";
  taskCode: TaskCode | null;
  absenceCode: AbsenceCode | null;
};

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

/* ─── Undo (Ctrl+Z) ────────────────────────────────────────────────
   On capture l'état "avant mutation" des cellules touchées, sous forme
   de petites snapshots (pas l'intégralité du state). Sur Ctrl+Z, on
   restaure ces snapshots via l'API.
   Limites :
   - Conservé en mémoire seulement (refresh = perdu)
   - Si une modif a une portée multi-semaines mais que les semaines
     non-visibles n'avaient pas encore été chargées dans `entries`,
     leur état "avant" est considéré comme vide (cas rare en pratique).
*/
type CellSnapshot = {
  employeeId: string;
  date: string;
  timeSlot: string;
  /** null = la case était vide ; sinon, contenu exact à restaurer. */
  before:
    | { type: "TASK" | "ABSENCE"; taskCode: TaskCode | null; absenceCode: AbsenceCode | null }
    | null;
};

type UndoAction = {
  /** Court label affiché dans le toast après undo (ex. "modification") */
  label: string;
  snapshots: CellSnapshot[];
};

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
  initialDayIndex,
  employees: initialEmployees,
  initialEntries,
  role,
  minStaff,
  currentEmployeeId,
  events = [],
}: {
  initialWeekStart: string;
  /** Jour pré-sélectionné (0 = lundi … 5 = samedi). Si null, "aujourd'hui". */
  initialDayIndex?: number | null;
  employees: EmployeeDTO[];
  initialEntries: ScheduleEntryDTO[];
  role: UserRole;
  minStaff: number;
  /** ID de l'Employee lié au compte connecté (null si admin sans liaison) */
  currentEmployeeId?: string | null;
  /** Événements d'équipe proches (date ISO) → animation sur le jour concerné. */
  events?: { date: string; title: string; type: TeamEventType }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  // ─── État du planning (store Zustand) ──────────────────────────────
  // Seed du store AVANT la 1re lecture de `entries` (le store est un singleton
  // module, initialement vide → sans ça, flash de planning vide au 1er rendu).
  useState(() => {
    usePlanningStore.getState().resetForWeek(initialEntries);
    return null;
  });
  const entries = usePlanningStore((s) => s.entries);
  const pushUndo = usePlanningStore((s) => s.pushUndo);
  // Shim : conserve l'ancienne signature de setEntries (valeur OU updater) pour
  // ne pas toucher les ~20 call-sites des handlers de mutation. Lit/écrit le
  // store (toujours frais → plus besoin du ref miroir entriesRef).
  const setEntries = useCallback(
    (
      next:
        | ScheduleEntryDTO[]
        | ((prev: ScheduleEntryDTO[]) => ScheduleEntryDTO[])
    ) => {
      const cur = usePlanningStore.getState().entries;
      usePlanningStore
        .getState()
        .setEntries(typeof next === "function" ? next(cur) : next);
    },
    []
  );
  // Dates visibles — lues via ref par applySnapshots (hors deps). Mises à jour
  // via useEffect une fois `dayDates` calculé.
  const dayDatesRef = useRef<string[]>([]);
  // Presse-papiers de postes (copier/coller entre jours, Ctrl+C / Ctrl+V).
  const [clipboard, setClipboard] = useState<ClipEntry[]>([]);
  // Ref miroir pour le handler clavier copier/coller : évite de re-souscrire le
  // listener à chaque édition (entries change souvent) tout en lisant l'état à jour.
  const copyPasteRef = useRef<{
    copy: () => void;
    paste: () => void;
    bulkClear: () => void;
    hasSelection: boolean;
    hasClipboard: boolean;
    canEdit: boolean;
    modalOpen: boolean;
  }>({
    copy: () => {},
    paste: () => {},
    bulkClear: () => {},
    hasSelection: false,
    hasClipboard: false,
    canEdit: false,
    modalOpen: false,
  });
  // Liste de collaborateurs locale — mirror du prop, mais éditable quand
  // l'admin réordonne les colonnes via drag & drop. Resync sur l'initial
  // dès que le serveur renvoie une nouvelle liste (changement de pharmacie,
  // ajout/suppression de membre, etc.).
  const [employees, setEmployees] = useState<EmployeeDTO[]>(initialEmployees);
  useEffect(() => {
    setEmployees(initialEmployees);
  }, [initialEmployees]);
  const [dayIndex, setDayIndex] = useState(() => {
    // Priorité au paramètre d'URL `?day=N` si fourni (depuis la vue semaine)
    if (
      typeof initialDayIndex === "number" &&
      initialDayIndex >= 0 &&
      initialDayIndex <= 5
    ) {
      return initialDayIndex;
    }
    const today = new Date();
    const weekday = (today.getDay() + 6) % 7;
    return Math.min(5, Math.max(0, weekday));
  });
  const [selection, setSelection] = useState<Selection>(null);
  const [multiSelection, setMultiSelection] = useState<Set<CellKey>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState<Set<CellKey>>(new Set());
  // Piles undo/redo (Ctrl+Z / Ctrl+Y) : gérées dans le store Zustand. Lues via
  // getState() dans les handlers ; aucun rendu ne dépend de leur contenu
  // (undo/redo sont clavier-seul) → pas de souscription, pas de re-render.
  // Filtre par métier : partagé et persistant dans l'URL (?metier=…), commun aux
  // vues jour / semaine / mois. Set vide = aucun filtre (tous visibles).
  const { selected: statusFilter, setSelected: setStatusFilter } = useMetierFilter();

  // ─── Mode d'affichage mobile ─────────────────────────────────────
  // "mine" : timeline verticale du jour de l'utilisateur connecté (par
  //          défaut quand il a une fiche Employee).
  // "day"  : frise horaire de l'équipe pour le jour sélectionné — qui est
  //          présent, sur quel poste, avec l'effectif. Remplace l'ancienne
  //          grille 20 colonnes illisible sur téléphone.
  // "week" : récap compact employés × 6 jours pour voir toute la semaine.
  // Sur desktop ce state est ignoré (la grille s'affiche toujours).
  // Défaut : "day" (la frise équipe = moi + l'équipe en un coup d'œil) pour
  // tout le monde. La dernière vue choisie est ensuite restaurée depuis
  // localStorage si elle existe (cf. effet plus bas).
  const [mobileView, setMobileView] = useState<"mine" | "day" | "week">("day");

  // Mémorise la dernière vue mobile choisie (Moi / Jour / Semaine) pour la
  // restaurer au prochain chargement — évite de toujours repartir du défaut.
  // Restauration côté client uniquement (localStorage indisponible en SSR) ;
  // "mine" n'est restauré que si l'utilisateur a bien une fiche Employee.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("pp_mobile_view");
    if (saved === "day" || saved === "week" || (saved === "mine" && currentEmployeeId)) {
      setMobileView(saved);
    }
  }, [currentEmployeeId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("pp_mobile_view", mobileView);
    }
  }, [mobileView]);

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

  /**
   * Efface plusieurs créneaux en UNE seule requête (DELETE avec corps JSON).
   * Avant, on tirait une requête HTTP par case (`Promise.all(cells.map(fetch))`),
   * ce qui ouvrait N connexions BDD simultanées et saturait le pool Supabase
   * (erreur EMAXCONN → 500 → page d'erreur). Renvoie true si l'appel a réussi.
   */
  async function deletePlanningEntries(
    cells: Array<{ employeeId: string; date: string; timeSlot: string }>
  ): Promise<boolean> {
    if (cells.length === 0) return true;
    try {
      const res = await fetch("/api/planning", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cells }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // `pushUndo` (capture l'état AVANT mutation + empile, vide le redo) est
  // fourni par le store : `const pushUndo = usePlanningStore(s => s.pushUndo)`
  // plus haut. La capture de snapshots est interne au store.

  /**
   * Restaure l'état décrit par une UndoAction (utilisé par undo ET redo) :
   *  - DELETE pour les cellules qui étaient vides dans le snapshot
   *  - POST (force=true) pour les cellules qui avaient une tâche/absence
   * Optimistic local + rollback si l'API échoue. Renvoie true en cas de
   * succès, false sinon.
   */
  const applySnapshots = useCallback(
    async (action: UndoAction): Promise<boolean> => {
      const toRestore = action.snapshots.filter((s) => s.before !== null);
      const toDelete = action.snapshots.filter((s) => s.before === null);
      const previousEntries = usePlanningStore.getState().entries;
      const visibleDates = new Set(dayDatesRef.current);

      setEntries((prev) => {
        let next = applyEntriesDelete(
          prev,
          toDelete.map((s) => ({
            employeeId: s.employeeId,
            date: s.date,
            timeSlot: s.timeSlot,
          })),
          visibleDates
        );
        next = applyEntriesUpdate(
          next,
          toRestore.map((s) => ({
            employeeId: s.employeeId,
            date: s.date,
            timeSlot: s.timeSlot,
            type: s.before!.type,
            taskCode: s.before!.taskCode,
            absenceCode: s.before!.absenceCode,
          })),
          visibleDates
        );
        return next;
      });
      flashCells(action.snapshots.map((s) => entryKey(s)));

      try {
        // 1 DELETE bulk (cases à vider) + 1 POST bulk (cases à restaurer) en
        // parallèle — au lieu d'une requête par case (qui saturait le pool).
        const promises: Array<Promise<unknown>> = [];
        if (toDelete.length > 0) {
          promises.push(
            deletePlanningEntries(
              toDelete.map((c) => ({
                employeeId: c.employeeId,
                date: c.date,
                timeSlot: c.timeSlot,
              }))
            )
          );
        }
        if (toRestore.length > 0) {
          promises.push(
            postPlanningEntries(
              toRestore.map((s) => ({
                employeeId: s.employeeId,
                date: s.date,
                timeSlot: s.timeSlot,
                type: s.before!.type,
                taskCode: s.before!.taskCode,
                absenceCode: s.before!.absenceCode,
              })),
              true // force : on bypass le check d'absence pour restaurer un état précédent
            )
          );
        }
        await Promise.all(promises);
        return true;
      } catch {
        setEntries(previousEntries);
        return false;
      }
    },
    // postPlanningEntries + dayDatesRef sont accédés via closure/ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Annule la dernière mutation. La pile redo récupère l'état courant des
   * cellules concernées AVANT la restauration, pour permettre Ctrl+Y.
   */
  const handleUndo = useCallback(async () => {
    // popUndo dépile l'action, capture sa contrepartie redo (état courant) et
    // la renvoie — ou null si la pile est vide.
    const action = usePlanningStore.getState().popUndo();
    if (!action) {
      toast({ tone: "info", title: "Rien à annuler", duration: 1500 });
      return;
    }
    const ok = await applySnapshots(action);
    if (ok) {
      toast({
        tone: "success",
        title: "Annulé",
        description: action.label,
        duration: 1800,
      });
    } else {
      toast({
        tone: "error",
        title: "Annulation impossible",
        description: "Erreur réseau.",
      });
    }
  }, [toast, applySnapshots]);

  /**
   * Refait la dernière action annulée. Symétrique de handleUndo : la pile
   * undo récupère l'état courant avant la restauration.
   */
  const handleRedo = useCallback(async () => {
    const action = usePlanningStore.getState().popRedo();
    if (!action) {
      toast({ tone: "info", title: "Rien à refaire", duration: 1500 });
      return;
    }
    const ok = await applySnapshots(action);
    if (ok) {
      toast({
        tone: "success",
        title: "Refait",
        description: action.label,
        duration: 1800,
      });
    } else {
      toast({
        tone: "error",
        title: "Refaire impossible",
        description: "Erreur réseau.",
      });
    }
  }, [toast, applySnapshots]);

  // Raccourci clavier : Ctrl+Z (undo), Ctrl+Y ou Ctrl+Shift+Z (redo).
  // Cmd+… sur Mac. On évite de capturer la frappe quand l'utilisateur est
  // en train de taper dans un input/textarea (TaskSelector, BulkTaskSelector,
  // formulaires de notes, etc.) — l'undo natif du champ doit rester prioritaire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const isUndo = !e.shiftKey && key === "z";
      const isRedo =
        (!e.shiftKey && key === "y") || (e.shiftKey && key === "z");
      if (!isUndo && !isRedo) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      if (isUndo) void handleUndo();
      else void handleRedo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo]);

  // Copier / coller des postes (Ctrl/⌘+C, Ctrl/⌘+V). On lit l'état courant via
  // `copyPasteRef` (mis à jour au rendu) → listener stable, pas de re-souscription
  // à chaque édition. Ctrl+C ne s'active que si des cases sont sélectionnées ET
  // qu'aucun texte n'est sélectionné (copier-coller de texte natif préservé).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "v") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      const s = copyPasteRef.current;
      if (!s.canEdit) return;
      if (key === "c") {
        if (!s.hasSelection) return;
        if (window.getSelection()?.toString()) return; // laisse copier du texte
        e.preventDefault();
        s.copy();
      } else {
        if (!s.hasClipboard) return;
        e.preventDefault();
        s.paste();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries, setEntries]);

  useEffect(() => {
    setWeekStart(initialWeekStart);
    // Changer de semaine vide les piles d'undo/redo : un Ctrl+Z (ou Ctrl+Y)
    // dans la nouvelle semaine ne doit pas modifier silencieusement des
    // cellules d'une autre.
    usePlanningStore.setState({ undoStack: [], redoStack: [] });
  }, [initialWeekStart]);

  // Si l'URL change avec un `?day=N` (ex. clic depuis la vue semaine),
  // synchronise le jour affiché. On ignore la valeur null/undefined pour
  // que le user qui navigue manuellement entre jours ne soit pas reset.
  useEffect(() => {
    if (
      typeof initialDayIndex === "number" &&
      initialDayIndex >= 0 &&
      initialDayIndex <= 5
    ) {
      setDayIndex(initialDayIndex);
    }
  }, [initialDayIndex]);

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

  // Suppr / Retour arrière → efface les cases sélectionnées (agenda planning
  // ET gabarit). On lit l'état via `copyPasteRef` (mis à jour au rendu) pour
  // garder un listener stable. Garde-fous : édition autorisée, au moins une
  // case sélectionnée, aucun modal ouvert, et on ne capture pas la frappe
  // quand l'utilisateur tape dans un champ (le Retour arrière natif prime).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      const s = copyPasteRef.current;
      if (!s.canEdit || !s.hasSelection || s.modalOpen) return;
      e.preventDefault();
      s.bulkClear();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const monday = useMemo(() => new Date(`${weekStart}T00:00:00`), [weekStart]);
  // Vrai quand la semaine affichée est la semaine calendaire en cours — sert au
  // repère visuel « Cette semaine » dans la navigation.
  const isCurrentWeek = useMemo(() => weekStart === startOfTodayWeek(), [weekStart]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const dayDates = useMemo(() => days.map(toIsoDate), [days]);
  // Sync vers le ref pour que handleUndo (défini plus haut) ait toujours la
  // dernière valeur sans figer de dépendance React.
  useEffect(() => {
    dayDatesRef.current = dayDates;
  }, [dayDates]);
  const selectedDay = dayDates[dayIndex];

  // Événements d'équipe indexés par date (ISO) → on décore le jour concerné
  // dans l'agenda (onglets + pastille en tête du jour sélectionné).
  const eventsByDate = useMemo(() => {
    const m = new Map<string, { title: string; type: TeamEventType }[]>();
    for (const e of events) {
      const arr = m.get(e.date);
      if (arr) arr.push({ title: e.title, type: e.type });
      else m.set(e.date, [{ title: e.title, type: e.type }]);
    }
    return m;
  }, [events]);
  const selectedDayEvents = eventsByDate.get(selectedDay) ?? [];

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

  // NB : l'analyse de couverture (sous-effectif, pas de pharmacien…) et la
  // liste des absents ont été déplacées dans la page « Infos & conseils »
  // (/infos) — elles ne sont donc plus recalculées à chaque modification du
  // planning. Le repère d'effectif reste porté par les pastilles par créneau
  // (grille) et la ligne « Eff. mini » (vue Semaine).

  // Navigation semaine : un seul round-trip via router.replace (le serveur
  // re-fetch la nouvelle semaine et l'effet sur initialEntries/initialWeekStart
  // synchronise l'état local). On évite le double-fetch + refresh redondant.
  const navigateWeek = useCallback(
    (delta: number) => {
      const next = new Date(monday);
      next.setDate(next.getDate() + delta * 7);
      const iso = toIsoDate(next);
      setMultiSelection(new Set());
      // Préserve le filtre métier courant (?metier=…) à travers la navigation.
      router.replace(appendCurrentMetier(`?week=${iso}`), { scroll: false });
    },
    [monday, router]
  );

  const goToCurrentWeek = useCallback(() => {
    const today = startOfTodayWeek();
    // Sélectionne aussi le jour d'aujourd'hui (Lun=0..Sam=5, dim → samedi)
    const todayWeekday = Math.min(5, Math.max(0, (new Date().getDay() + 6) % 7));
    setDayIndex(todayWeekday);
    setMultiSelection(new Set());
    router.replace(appendCurrentMetier(`?week=${today}`), { scroll: false });
  }, [router]);

  // Naviguer vers une date précise (depuis le date picker de la toolbar).
  // Calcule le lundi de la semaine ciblée + le jour (Lun=0..Sam=5, dim→sam).
  const goToDate = useCallback(
    (iso: string) => {
      const target = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(target.getTime())) return;
      // Décalage jusqu'au lundi
      const dow = target.getDay(); // 0 = dimanche
      const diffToMonday = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(target);
      monday.setDate(target.getDate() + diffToMonday);
      const mondayIso = toIsoDate(monday);
      const dayInWeek = Math.min(5, Math.max(0, (dow + 6) % 7));
      setDayIndex(dayInWeek);
      setMultiSelection(new Set());
      router.replace(
        appendCurrentMetier(`?week=${mondayIso}&day=${dayInWeek}`),
        { scroll: false }
      );
    },
    [router]
  );

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
      if (!canEditPlanning(role)) return;
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

    // Snapshot pour Ctrl+Z (avant la mutation)
    pushUndo("modification", updates);

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

    // Snapshot pour Ctrl+Z (avant la mutation)
    pushUndo("effacement", deletes);

    // Optimistic delete
    const previousEntries = entries;
    const visibleDates = new Set(dayDates);
    setEntries((prev) => applyEntriesDelete(prev, deletes, visibleDates));
    setSelection(null);

    const ok = await deletePlanningEntries(deletes);
    if (!ok) {
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

      // Snapshot pour Ctrl+Z (avant la mutation)
      pushUndo("déplacement", [source, target]);

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

  /**
   * Déplace un bloc de plusieurs cellules TASK contigües (matin/aprem/journée)
   * du long-press tactile sur la grille planning.
   *
   * Calcule l'offset entre la source long-pressée et la cible drop, applique
   * cet offset à toutes les cellules du bloc, puis exécute :
   *   - DELETE de toutes les cellules d'origine (parallèle)
   *   - POST des nouvelles cellules en bulk (1 round-trip)
   * Mise à jour optimiste + rollback en cas d'échec.
   */
  const handleMoveBlock = useCallback(
    async (
      block: DnDParsedCell[],
      source: DnDParsedCell,
      target: DnDParsedCell
    ) => {
      // Récupère le taskCode du bloc (toutes ses cellules ont le même)
      const sourceEntry = entries.find(
        (e) =>
          e.employeeId === source.employeeId &&
          e.date === source.date &&
          e.timeSlot === source.timeSlot
      );
      if (!sourceEntry || sourceEntry.type !== "TASK" || !sourceEntry.taskCode) {
        return;
      }

      // Validation rôle/poste sur la nouvelle colonne
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

      // Offsets : delta de slot + employé cible
      const sourceSlotIdx = TIME_SLOTS.indexOf(source.timeSlot);
      const targetSlotIdx = TIME_SLOTS.indexOf(target.timeSlot);
      const slotDelta = targetSlotIdx - sourceSlotIdx;

      // Calcule les nouvelles positions de chaque cellule du bloc
      type Move = {
        from: { employeeId: string; date: string; timeSlot: string };
        to: { employeeId: string; date: string; timeSlot: string };
      };
      const moves: Move[] = [];
      for (const cell of block) {
        const oldIdx = TIME_SLOTS.indexOf(cell.timeSlot);
        const newIdx = oldIdx + slotDelta;
        if (newIdx < 0 || newIdx >= TIME_SLOTS.length) {
          toast({
            tone: "error",
            title: "Déplacement refusé",
            description: "Le bloc dépasserait les horaires d'ouverture.",
          });
          return;
        }
        moves.push({
          from: cell,
          to: {
            employeeId: target.employeeId,
            date: cell.date,
            timeSlot: TIME_SLOTS[newIdx],
          },
        });
      }

      // Refus si une cible est une absence APPROUVÉE
      const blockedByAbsence = moves.find((m) => {
        const t = entries.find(
          (e) =>
            e.employeeId === m.to.employeeId &&
            e.date === m.to.date &&
            e.timeSlot === m.to.timeSlot
        );
        return t?.type === "ABSENCE";
      });
      if (blockedByAbsence) {
        toast({
          tone: "error",
          title: "Déplacement refusé",
          description: "Une cellule cible contient une absence validée.",
        });
        return;
      }

      // Snapshot pour Ctrl+Z : on capture toutes les cellules touchées (from + to)
      pushUndo("déplacement de bloc", [
        ...moves.map((m) => m.from),
        ...moves.map((m) => m.to),
      ]);

      // Optimistic : delete sources + add targets en local
      const previousEntries = entries;
      const visibleDates = new Set(dayDates);
      const newEntriesPayload = moves.map((m) => ({
        employeeId: m.to.employeeId,
        date: m.to.date,
        timeSlot: m.to.timeSlot,
        type: "TASK" as const,
        taskCode: sourceEntry.taskCode,
        absenceCode: null,
      }));

      setEntries((prev) => {
        const afterDelete = applyEntriesDelete(
          prev,
          moves.map((m) => m.from),
          visibleDates
        );
        return applyEntriesUpdate(afterDelete, newEntriesPayload, visibleDates);
      });
      flashCells(moves.map((m) => entryKey(m.to)));

      // Backend : DELETE en parallèle pour toutes les sources + 1 POST bulk
      // pour les nouvelles cellules. Pour 10 cellules : ~5 RT en parallèle
      // + 1 POST = ~150ms total via prismaDirect.
      // 1 POST bulk (nouvelles cases) + 1 DELETE bulk (cases d'origine), en
      // parallèle — 2 requêtes au total quel que soit le nombre de cellules.
      const [postRes, deleteOk] = await Promise.all([
        postPlanningEntries(newEntriesPayload),
        deletePlanningEntries(moves.map((m) => m.from)),
      ]);

      if (!postRes.ok) {
        setEntries(previousEntries);
        toast({
          tone: "error",
          title: "Déplacement bloc annulé",
          description:
            "error" in postRes
              ? postRes.error
              : "Erreur lors de l'écriture des nouvelles cellules.",
        });
        return;
      }
      if (!deleteOk) {
        setEntries(previousEntries);
        toast({
          tone: "error",
          title: "Déplacement bloc annulé",
          description: "Une cellule d'origine n'a pas pu être supprimée.",
        });
        return;
      }

      toast({
        tone: "success",
        title: "Bloc déplacé",
        description: `${moves.length} créneau${moves.length > 1 ? "x" : ""} déplacé${moves.length > 1 ? "s" : ""}.`,
        duration: 2500,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, employees, dayDates, toast]
  );

  /* ---------- Réordonnancement de colonnes (admin) ---------- */
  // Optimistic : on applique immédiatement le nouvel ordre côté UI puis on
  // appelle l'API. Si ça échoue, on rollback et on prévient l'utilisateur.
  const handleReorderColumns = useCallback(
    async (orderedIds: string[]) => {
      const previous = employees;
      const byId = new Map(previous.map((e) => [e.id, e]));
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((e): e is EmployeeDTO => !!e);
      // Filet de sécurité : si on perd des collaborateurs (cas impossible
      // en théorie puisque l'API source n'envoie que des ids existants),
      // on réinjecte ceux qui manquent à la fin.
      if (next.length !== previous.length) {
        const seen = new Set(next.map((e) => e.id));
        for (const e of previous) if (!seen.has(e.id)) next.push(e);
      }
      setEmployees(next);

      try {
        const res = await fetch("/api/employees/reorder", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds: next.map((e) => e.id) }),
        });
        if (!res.ok) throw new Error("api");
        // Refresh discret pour resync les autres pages (vue semaine / mois)
        // au prochain rendu — sans bloquer la grille courante.
        router.refresh();
      } catch {
        setEmployees(previous);
        toast({
          tone: "error",
          title: "Réordonnancement impossible",
          description: "Le serveur a refusé la modification. Réessayez.",
          duration: 3500,
        });
      }
    },
    [employees, router, toast]
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

    // Snapshot pour Ctrl+Z (avant la mutation)
    pushUndo("modification bulk", expanded);

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

    // Snapshot pour Ctrl+Z (avant la mutation)
    pushUndo("effacement bulk", expanded);

    // Optimistic delete
    const previousEntries = entries;
    const visibleDates = new Set(dayDates);
    setEntries((prev) => applyEntriesDelete(prev, expanded, visibleDates));
    setBulkOpen(false);
    setMultiSelection(new Set());

    const ok = await deletePlanningEntries(expanded);
    if (!ok) {
      setEntries(previousEntries);
      toast({
        tone: "error",
        title: "Suppression bulk annulée",
        description: "Erreur réseau, créneaux restaurés.",
      });
    }
  }

  /**
   * Copie le contenu des cases sélectionnées dans le presse-papiers (postes +
   * position employé/horaire, sans la date). Seules les cases REMPLIES sont
   * retenues → un collage ne vient jamais effacer une case cible par une case
   * source vide.
   */
  function copySelection() {
    const cells = Array.from(multiSelection).map(parseCellKey);
    const items = cells
      .map((c): ClipEntry | null => {
        const e = entries.find(
          (x) =>
            x.employeeId === c.employeeId &&
            x.date === c.date &&
            x.timeSlot === c.timeSlot
        );
        if (!e) return null;
        return {
          employeeId: c.employeeId,
          timeSlot: c.timeSlot,
          type: e.type,
          taskCode: e.taskCode,
          absenceCode: e.absenceCode,
        };
      })
      .filter((x): x is ClipEntry => x !== null);
    if (items.length === 0) {
      toast({
        tone: "info",
        title: "Rien à copier",
        description: "Sélectionne des cases déjà remplies.",
      });
      return;
    }
    setClipboard(items);
    toast({
      tone: "success",
      title: `${items.length} créneau${items.length > 1 ? "x" : ""} copié${items.length > 1 ? "s" : ""}`,
      description: "Ctrl+V pour coller sur le jour affiché.",
    });
  }

  /**
   * Colle le presse-papiers sur le JOUR AFFICHÉ (selectedDay), aux mêmes
   * employé/horaire. Remplace le contenu des cases cibles (n'efface pas les
   * autres). Même chemin sécurisé que « Appliquer un poste » : optimistic +
   * snapshot Ctrl+Z + POST avec gestion des conflits d'absence approuvée.
   */
  async function pasteClipboard() {
    if (clipboard.length === 0) return;
    const expanded = clipboard.map((c) => ({
      employeeId: c.employeeId,
      date: selectedDay,
      timeSlot: c.timeSlot,
      type: c.type,
      taskCode: c.taskCode,
      absenceCode: c.absenceCode,
    }));

    pushUndo("collage", expanded);
    const previousEntries = entries;
    const visibleDates = new Set(dayDates);
    setEntries((prev) => applyEntriesUpdate(prev, expanded, visibleDates));
    flashCells(expanded.map((c) => entryKey(c)));
    const dayLabel = new Date(`${selectedDay}T12:00:00`).toLocaleDateString(
      "fr-FR",
      { weekday: "long", day: "numeric", month: "long" }
    );
    toast({
      tone: "success",
      title: `${expanded.length} créneau${expanded.length > 1 ? "x" : ""} collé${expanded.length > 1 ? "s" : ""}`,
      description: `Sur ${dayLabel}`,
    });

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
            toast({ tone: "error", title: "Collage annulé", description: errMsg });
          }
          setConflictPrompt(null);
        },
        onCancel: () => {
          setEntries(previousEntries);
          setConflictPrompt(null);
          toast({
            tone: "info",
            title: "Collage annulé",
            description: "Les créneaux d'absence approuvée sont préservés.",
          });
        },
      });
      return;
    }
    setEntries(previousEntries);
    toast({ tone: "error", title: "Collage annulé", description: result.error });
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

  // « isAdmin » ici = peut ÉDITER le planning (titulaire, créateur OU manageur).
  const isAdmin = canEditPlanning(role);

  // Mode "lecture" admin : protège des modifs accidentelles sur tactile.
  // L'admin a le droit d'éditer (canEdit conceptuellement vrai) MAIS s'il
  // active le verrou, on le traite comme un user lecture seule pour ce
  // session UI. Persisté dans localStorage pour qu'il retrouve son mode
  // au prochain login.
  const [adminLocked, setAdminLocked] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;

    // Détection device tactile (téléphone/tablette). matchMedia n'existe
    // que côté client, donc cette logique ne tourne qu'au mount.
    const isTouch =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (isTouch) {
      // Sur mobile/tablette : verrouillé par défaut À CHAQUE session pour
      // éviter les modifs accidentelles au tap. L'admin peut déverrouiller
      // ponctuellement pour éditer, mais ça ne persiste PAS — au prochain
      // reload on retombe en lecture seule. C'est volontaire : la sécurité
      // anti-tap prime sur la commodité de garder son choix.
      setAdminLocked(true);
      return;
    }

    // Desktop : respecte la préférence persistée en localStorage
    // (l'admin garde son mode au prochain login).
    try {
      const stored = window.localStorage.getItem("ph_admin_locked");
      if (stored === "1") setAdminLocked(true);
    } catch {
      /* localStorage indispo (mode privé Safari) — on ignore silencieusement */
    }
  }, [isAdmin]);

  // La grille desktop n'est MONTÉE qu'au-delà de md (768px) → mobile ne charge
  // pas le chunk dnd-kit + grille. Aligné sur le `hidden md:block` du wrapper.
  const [isDesktopWidth, setIsDesktopWidth] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktopWidth(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ─── Ajustement de la grille à la hauteur de l'écran (desktop) ──────────
  // Objectif : sur petit écran, voir tout le planning sans scroller la page ET
  // garder l'en-tête « qui est qui » toujours visible. On mesure l'espace
  // disponible sous le haut de la grille puis :
  //   - on borne la hauteur de la grille (scroll interne, la page ne bouge plus)
  //   - on compresse la hauteur des lignes pour tout faire tenir quand c'est
  //     possible (borné à un minimum lisible ; au-delà l'en-tête reste figé et
  //     la grille défile en interne).
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ maxHeight: number; rowHeight: number } | null>(
    null
  );
  useEffect(() => {
    if (!isDesktopWidth) {
      setFit(null);
      return;
    }
    function recompute() {
      const el = gridWrapRef.current;
      if (!el || typeof window === "undefined") return;
      const top = el.getBoundingClientRect().top; // haut de la grille → haut viewport
      const bottomMargin = 10; // petite marge sous la grille
      const maxHeight = Math.max(
        200,
        Math.round(window.innerHeight - top - bottomMargin)
      );
      const numSlots = TIME_SLOTS.length;
      // Hauteur RÉELLE de l'en-tête (noms + heures) si déjà rendu, sinon estimation.
      const thead = el.querySelector("thead");
      const headerH = thead
        ? Math.round(thead.getBoundingClientRect().height)
        : 64;
      // Objectif : voir TOUTE la journée (7h30-20h) sans défilement, quelle que
      // soit la taille de l'écran → on comprime les lignes autant que nécessaire.
      // On déduit la ligne de fermeture « 20:00 » (~16 px, hauteur fixe) + une
      // petite marge de sécurité (bordures, arrondis sub-pixel) pour que la
      // grille tienne VRAIMENT dans l'espace dispo → aucun scroll quand il y a
      // la place. Plancher bas (11 px) : sur très petit écran ça défile encore.
      const CLOSING_ROW_H = 16;
      const SAFETY = 6;
      const rowHeight = Math.min(
        52,
        Math.max(
          11,
          Math.floor((maxHeight - headerH - CLOSING_ROW_H - SAFETY) / numSlots)
        )
      );
      // Guard ANTI-BOUCLE : on ne met à jour QUE si la valeur change vraiment.
      // Sinon setFit → re-render → la grille change de hauteur → le body change
      // de hauteur → ResizeObserver → recompute → … boucle infinie qui FIGE la
      // page. Retourner `prev` à l'identique coupe la boucle net.
      setFit((prev) =>
        prev && prev.maxHeight === maxHeight && prev.rowHeight === rowHeight
          ? prev
          : { maxHeight, rowHeight }
      );
    }
    recompute();
    window.addEventListener("resize", recompute);
    // Recalcule aussi quand le contenu AU-DESSUS de la grille change de hauteur
    // (consigne du jour affichée/masquée, phrase du jour qui s'enroule…) : le
    // haut de la grille bouge alors sans redimensionnement de fenêtre. On passe
    // par requestAnimationFrame pour coalescer les rafales et éviter l'erreur
    // « ResizeObserver loop limit exceeded ».
    let ro: ResizeObserver | null = null;
    let raf = 0;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(recompute);
      });
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener("resize", recompute);
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [isDesktopWidth]);

  const toggleAdminLock = useCallback(() => {
    setAdminLocked((prev) => {
      const next = !prev;
      // Persistance localStorage UNIQUEMENT sur desktop. Sur mobile, le
      // verrou est session-only : à chaque rechargement on re-verrouille
      // (cf. effet d'init plus haut), peu importe ce qui est en storage.
      const isTouch =
        typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches;
      if (!isTouch) {
        try {
          window.localStorage.setItem("ph_admin_locked", next ? "1" : "0");
        } catch {
          /* idem */
        }
      }
      // Vide la sélection en cours pour éviter qu'un état d'édition reste
      // suspendu après le lock.
      setSelection(null);
      setMultiSelection(new Set());
      return next;
    });
  }, []);

  // canEdit effectif : admin uniquement, ET pas en mode verrouillé.
  const effectiveCanEdit = isAdmin && !adminLocked;

  // Synchronise le ref lu par le handler clavier copier/coller avec l'état
  // courant (fonctions fraîches + garde-fous). Fait à chaque rendu.
  copyPasteRef.current = {
    copy: copySelection,
    paste: pasteClipboard,
    // Suppr efface exactement les cases sélectionnées (scope "1" = la case
    // elle-même, aucune réplication sur d'autres semaines).
    bulkClear: () => void handleBulkClear({ scope: "1" }),
    hasSelection: multiSelection.size > 0,
    hasClipboard: clipboard.length > 0,
    canEdit: effectiveCanEdit,
    // Un modal ouvert (TaskSelector / BulkTaskSelector) capte déjà le clavier :
    // on ne déclenche pas la suppression globale par-dessus.
    modalOpen: !!selection || bulkOpen,
  };

  // Onglets de jour (segmented control iOS-like). Défini en variable pour être
  // rendu INLINE à droite du titre « Planning · S28 » (gain de hauteur) tout en
  // gardant toute sa logique (badges absences/férié + animation événement).
  const dayTabsControl = (
    <div className="no-print">
      <div className="inline-flex w-full md:w-auto items-center gap-0.5 rounded-xl bg-muted/40 dark:bg-zinc-800/60 p-1">
        {WEEK_DAYS.map((label, i) => {
          const date = days[i];
          const absCount = absencesPerDay[i];
          const active = i === dayIndex;
          const holiday = holidaysIndex.get(dayDates[i]) ?? null;
          const dayEvents = eventsByDate.get(dayDates[i]) ?? [];
          const hasEvent = dayEvents.length > 0;
          return (
            <button
              key={i}
              onClick={() => setDayIndex(i)}
              title={
                hasEvent
                  ? `🎉 ${dayEvents.map((e) => e.title).join(" · ")}`
                  : holiday
                    ? `${holiday.name} (jour férié)`
                    : undefined
              }
              className={cn(
                "relative flex-1 md:flex-none flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 transition-all min-w-[58px]",
                active
                  ? "bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-foreground dark:shadow-none dark:ring-1 dark:ring-zinc-700"
                  : "text-muted-foreground hover:text-foreground",
                holiday && (active ? "text-rose-700 dark:text-rose-300" : "text-rose-500 dark:text-rose-400"),
                hasEvent && "ring-1 ring-violet-300/80 dark:ring-violet-700/70"
              )}
            >
              <span className="text-[10px] uppercase tracking-[0.08em] font-medium">
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{WEEK_DAYS_SHORT[i]}</span>
              </span>
              <span className="text-[12.5px] font-semibold tabular-nums leading-none">
                {date.getDate().toString().padStart(2, "0")}
                <span className="text-muted-foreground/40">/</span>
                {(date.getMonth() + 1).toString().padStart(2, "0")}
              </span>
              {holiday && (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-zinc-100/70 dark:ring-zinc-800/70"
                />
              )}
              {absCount > 0 && (
                <span
                  className="absolute -top-1 -left-1 h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-[9px] font-semibold text-white inline-flex items-center justify-center tabular-nums"
                  aria-label={`${absCount} absent(s)`}
                >
                  {absCount}
                </span>
              )}
              {hasEvent && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-1.5 -right-1.5 tev-bob text-violet-500 drop-shadow-sm dark:text-violet-300"
                >
                  <PartyPopper className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="p-2 md:px-6 md:py-2 space-y-1.5 md:space-y-2 relative">
      {/* En-tête : titre + navigation, design Apple épuré */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-4 min-w-0">
          <div className="min-w-0 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sur mobile : titre compact ("Planning · S19") en 18px,
                sur desktop : version complète 26px */}
            <h1 className="text-[15px] md:text-[19px] font-semibold tracking-tight text-foreground">
              Planning
            </h1>
            <span className="text-[15px] md:text-[19px] font-semibold tracking-tight text-muted-foreground/40">
              ·
            </span>
            <span className="text-[15px] md:text-[19px] font-semibold tracking-tight text-muted-foreground">
              S{weekNumber}
            </span>
            <span className="ml-1 text-[10.5px] uppercase tracking-[0.08em] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
              {weekKind}
            </span>
            {!isAdmin && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                title="Lecture seule"
              >
                <Eye className="h-3 w-3" />
                Lecture
              </span>
            )}
            {isAdmin && adminLocked && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-800"
                title="Édition verrouillée — déverrouille avec le bouton 🔒 dans la barre"
              >
                <Lock className="h-3 w-3" />
                Verrouillé
              </span>
            )}
          </div>
          {/* Date "04 mai — 09 mai 2026" : redondante sur mobile avec le
              day picker juste en dessous → cachée. Garde sur desktop pour
              donner le contexte semaine sans avoir à scanner les onglets. */}
          <p className="hidden md:block text-[12.5px] text-muted-foreground mt-0.5 tabular-nums">
            {days[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
            {" "}—{" "}
            {days[5].toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
          </div>
          {/* Onglets de jour — INLINE à droite du titre (gain de hauteur) */}
          {dayTabsControl}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap no-print">
          {/* Sélecteur Jour/Semaine/Mois — pointe vers des pages dédiées
              (desktop). Masqué sur mobile : la navigation mobile passe par les
              onglets Moi/Jour/Semaine plus bas, et les pages Semaine/Mois ne
              sont pas pensées pour téléphone. */}
          <div className="hidden md:block">
            <ViewModeSelector current="day" weekStart={weekStart} />
          </div>
          {/* Boutons "outils admin" cachés sur mobile pour libérer l'espace
              et focus sur l'agenda — accessibles depuis desktop ou via les
              pages dédiées (/gabarits pour les templates).
              Restent visibles sur mobile : verrou admin (anti-tap accidentel),
              DatePicker et nav semaine (essentiels). */}
          {/* Outils admin desktop-only — wrappés dans un container invisible
              sur mobile pour libérer l'espace haut d'écran. Restent
              accessibles côté desktop ou via les pages dédiées. */}
          <div className="hidden md:contents">
            {isAdmin && (
              <ApplyTemplateButton
                weekStart={weekStart}
                onApplied={() => refetchWeek(weekStart)}
              />
            )}
            {isAdmin && (
              <AutoFillButton
                weekStart={weekStart}
                onApplied={() => refetchWeek(weekStart)}
              />
            )}
            <EmployeeStatusFilter
              selected={statusFilter}
              onChange={setStatusFilter}
            />
            <PrintButton
              currentEmployeeId={currentEmployeeId}
              weekStart={weekStart}
            />
          </div>
          {/* Verrou admin — bascule lecture seule pour éviter les modifs
              accidentelles sur tactile. Préférence persistée en localStorage.
              GARDÉ sur mobile car c'est exactement le bon contexte d'usage. */}
          {isAdmin && (
            <button
              onClick={toggleAdminLock}
              className={cn(
                "inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors",
                adminLocked
                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border-border bg-card text-foreground/70 hover:bg-accent/50"
              )}
              title={
                adminLocked
                  ? "Mode lecture seule — clique pour réactiver l'édition"
                  : "Verrouiller en lecture seule (anti-modifs accidentelles)"
              }
              aria-label="Verrouiller la lecture seule"
              aria-pressed={adminLocked}
            >
              {adminLocked ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </button>
          )}
          {/* Date picker + nav semaine — gardés sur mobile, essentiels */}
          <DatePickerButton selectedDate={selectedDay} onPick={goToDate} />
          <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5 ml-1">
            <button
              onClick={() => navigateWeek(-1)}
              className="h-8 w-8 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-accent/60 transition-colors"
              aria-label="Semaine précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToCurrentWeek}
              className={cn(
                "h-8 px-3 rounded-full text-[12px] font-medium transition-colors",
                isCurrentWeek
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                  : "text-foreground/80 hover:bg-accent/60"
              )}
              aria-label={
                isCurrentWeek
                  ? "Vous consultez la semaine en cours"
                  : "Aller à la semaine en cours"
              }
            >
              {isCurrentWeek ? "Cette semaine" : "Aujourd'hui"}
            </button>
            <button
              onClick={() => navigateWeek(1)}
              className="h-8 w-8 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-accent/60 transition-colors"
              aria-label="Semaine suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>


      {/* Pastille festive « jour d'événement » — en TÊTE du jour sélectionné
          (visible, contrairement à un bandeau en bas). Animation discrète. */}
      {selectedDayEvents.length > 0 && (
        <div className="no-print flex items-center gap-2 rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-50 to-fuchsia-50/70 px-3.5 py-2 text-[13px] text-violet-900 shadow-sm dark:border-violet-900/40 dark:from-violet-950/30 dark:to-fuchsia-950/20 dark:text-violet-100">
          <span className="tev-bob shrink-0 text-violet-500 dark:text-violet-300">
            <PartyPopper className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 font-medium">
            {selectedDayEvents.length === 1
              ? selectedDayEvents[0].title
              : `${selectedDayEvents.length} événements ce jour`}
          </span>
        </div>
      )}

      {/* Bandeau "jour férié" — badge "FR" stylé (pas d'emoji drapeau qui
          rend mal sur Windows), alignement centré, design Apple-épuré. */}
      {selectedDayHoliday && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/30 px-4 py-3 text-[13px] text-rose-900 dark:text-rose-200">
          <span className="inline-flex items-center justify-center h-6 min-w-[28px] px-1.5 rounded-md bg-rose-500 text-white text-[10.5px] font-bold tracking-[0.04em] shrink-0">
            FR
          </span>
          <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
            <span className="font-semibold">{selectedDayHoliday.name}</span>
            <span className="text-[12px] text-rose-600/85 dark:text-rose-300/80">· jour férié</span>
          </div>
        </div>
      )}

      {/* L'alerte « dépassement d'heures » a été déplacée dans Infos & conseils
          (visible titulaires uniquement) — retirée du planning. */}

      {/* ─── Toggle d'affichage mobile ──────────────────────────────
          Trois vues pensées pour le téléphone (geste pouce, zéro scroll
          latéral) :
            • "Moi"     — ma journée en cartes (si fiche Employee liée)
            • "Jour"    — frise horaire de l'équipe (qui/quoi/effectif)
            • "Semaine" — récap employés × 6 jours
          L'onglet "Moi" n'apparaît que si l'utilisateur a une fiche. */}
      <div className="md:hidden no-print">
        <div
          role="tablist"
          aria-label="Mode d'affichage"
          className="inline-flex w-full items-center gap-0.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/60 p-1"
        >
          {currentEmployeeId && (
            <button
              type="button"
              role="tab"
              aria-selected={mobileView === "mine"}
              onClick={() => setMobileView("mine")}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all",
                mobileView === "mine"
                  ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-none dark:ring-1 dark:ring-zinc-700"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Moi
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === "day"}
            onClick={() => setMobileView("day")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all",
              mobileView === "day"
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-none dark:ring-1 dark:ring-zinc-700"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Jour
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === "week"}
            onClick={() => setMobileView("week")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all",
              mobileView === "week"
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-none dark:ring-1 dark:ring-zinc-700"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Semaine
          </button>
        </div>
      </div>

      {/* ─── Vue "Moi" — mobile, mode mine ──────────────────────── */}
      {currentEmployeeId && mobileView === "mine" && (() => {
        const me = employees.find((e) => e.id === currentEmployeeId);
        if (!me) return null;
        return (
          <div className="md:hidden">
            <MyDayView
              employee={me}
              date={selectedDay}
              entries={entries}
            />
          </div>
        );
      })()}

      {/* ─── Vue "Jour" — mobile, frise Gantt équipe (moi + équipe) ── */}
      {mobileView === "day" && (
        <div className="md:hidden">
          <MobileTeamGantt
            employees={employees}
            date={selectedDay}
            index={index}
            minStaff={minStaff}
            currentEmployeeId={currentEmployeeId ?? null}
          />
        </div>
      )}

      {/* ─── Vue "Semaine" — mobile, récap 6 jours ──────────────── */}
      {mobileView === "week" && (
        <div className="md:hidden">
          <MobileWeekView
            employees={employees}
            weekDates={dayDates}
            dayNumbers={days.map((d) => d.getDate())}
            index={index}
            minStaff={minStaff}
            currentEmployeeId={currentEmployeeId ?? null}
            selectedDayIndex={dayIndex}
            onPickDay={(i) => {
              setDayIndex(i);
              setMobileView("day");
            }}
          />
        </div>
      )}

      {/* ─── Grille équipe ─────────────────────────────────────────
          Sur desktop : toujours affichée. Sur mobile : remplacée par les
          vues dédiées ci-dessus (frise / semaine / moi), donc masquée. */}
      {isDesktopWidth && (
        <div className="hidden md:block" ref={gridWrapRef}>
          <PlanningGrid
            employees={visibleEmployees}
            date={selectedDay}
            weekDates={dayDates}
            index={index}
            canEdit={effectiveCanEdit}
            minStaff={minStaff}
            selection={multiSelection}
            onSelectionChange={setMultiSelection}
            onCellClick={handleCellClick}
            overtimeCells={overtimeCells}
            recentlySaved={recentlySaved}
            currentEmployeeId={currentEmployeeId ?? null}
            onMoveTask={effectiveCanEdit ? handleMoveTask : undefined}
            onMoveBlock={effectiveCanEdit ? handleMoveBlock : undefined}
            onReorderColumns={effectiveCanEdit ? handleReorderColumns : undefined}
            fitHeight={fit?.maxHeight}
            fitRowHeight={fit?.rowHeight}
          />
        </div>
      )}


      {/* (Le FAB "+" de création rapide d'absence a été retiré sur mobile :
          la barre d'onglets + la page Accueil couvrent déjà l'accès aux
          absences, plus besoin d'un bouton flottant.) */}

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

      {/* Barres d'action flottantes (glass Apple-style) — pastille « Coller »
          empilée au-dessus de la pastille de sélection multi. */}
      {effectiveCanEdit && (clipboard.length > 0 || multiSelection.size > 0) && (
        <div className="no-print fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
          {/* Presse-papiers actif → coller sur le jour affiché (dispo même sans
              sélection, ex. après avoir changé de jour). */}
          {clipboard.length > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-border bg-card shadow-[0_4px_24px_-2px_rgba(0,0,0,0.12),0_2px_6px_-1px_rgba(0,0,0,0.06)] pl-3.5 pr-1 py-1 animate-in fade-in slide-in-from-bottom-4">
              <ClipboardPaste className="h-3.5 w-3.5 text-violet-600 shrink-0" />
              <span className="text-[12.5px] tracking-tight">
                <span className="font-semibold tabular-nums">{clipboard.length}</span>{" "}
                <span className="text-muted-foreground">au presse-papiers</span>
              </span>
              <button
                onClick={() => void pasteClipboard()}
                className="ml-1 h-7 px-3 rounded-full bg-violet-600 text-white text-[12px] font-medium hover:bg-violet-700 transition-colors"
                title="Coller sur le jour affiché (Ctrl+V)"
              >
                Coller ici
              </button>
              <button
                onClick={() => setClipboard([])}
                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Vider le presse-papiers"
                title="Vider le presse-papiers"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Sélection multiple → appliquer / copier / vider */}
          {multiSelection.size > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-border bg-card shadow-[0_4px_24px_-2px_rgba(0,0,0,0.12),0_2px_6px_-1px_rgba(0,0,0,0.06)] pl-3.5 pr-1 py-1 animate-in fade-in slide-in-from-bottom-4">
              <Layers className="h-3.5 w-3.5 text-violet-600 shrink-0" />
              <span className="text-[12.5px] tracking-tight">
                <span className="font-semibold tabular-nums">{multiSelection.size}</span>{" "}
                <span className="text-muted-foreground">
                  sélectionné{multiSelection.size > 1 ? "s" : ""}
                </span>
              </span>
              <button
                onClick={() => setBulkOpen(true)}
                className="ml-1 h-7 px-3 rounded-full bg-zinc-900 text-white text-[12px] font-medium hover:bg-zinc-800 transition-colors"
              >
                Appliquer un poste
              </button>
              {/* Copier la sélection (collable sur un autre jour) */}
              <button
                onClick={copySelection}
                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Copier la sélection"
                title="Copier la sélection (Ctrl+C)"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
              {/* Poubelle : vide directement les cases sélectionnées (cette
                  semaine), sans passer par le sélecteur. Annulable via Ctrl+Z
                  (handleBulkClear pousse un snapshot d'undo). */}
              <button
                onClick={() => void handleBulkClear({ scope: "1" })}
                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950/50 transition-colors"
                aria-label={`Vider ${multiSelection.size} case${multiSelection.size > 1 ? "s" : ""} sélectionnée${multiSelection.size > 1 ? "s" : ""}`}
                title="Vider les cases sélectionnées (Suppr)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setMultiSelection(new Set())}
                className="h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Annuler la sélection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
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

/**
 * Bouton "Choisir une date" qui ouvre le calendrier natif au clic.
 *
 * Implémentation : on superpose un `<input type="date">` invisible sur le
 * bouton iconique. Au clic, on appelle `showPicker()` (Chromium/Safari
 * récents) — fallback sur le focus sinon. Le natif a l'avantage d'être :
 *  - cohérent avec l'OS (calendrier que l'utilisateur connaît déjà)
 *  - localisé en français automatiquement
 *  - accessible clavier + lecteur d'écran sans effort
 *  - mobile-friendly (sélecteur tactile natif iOS / Android)
 */
function DatePickerButton({
  selectedDate,
  onPick,
}: {
  selectedDate: string;
  onPick: (iso: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Au clic/tap sur l'input transparent (le vrai déclencheur), on tente
  // showPicker() pour ouvrir le sélecteur natif sur desktop (Chrome/Edge
  // n'ouvrent pas le calendrier sur un simple clic sans icône visible). Sur
  // mobile, le tap natif sur l'input ouvre déjà le picker. PAS de el.click()
  // ici : on est dans le onClick de l'input → ça bouclerait à l'infini.
  const handleClick = () => {
    const el = inputRef.current;
    if (!el) return;
    if ("showPicker" in el && typeof el.showPicker === "function") {
      try {
        el.showPicker();
      } catch {
        /* picker déjà ouvert / geste non autorisé — ignoré */
      }
    }
  };
  return (
    <div className="relative inline-flex h-8 w-8">
      {/* Pastille visuelle (icône calendrier). Décorative : c'est l'input
          transparent par-dessus qui capte le tap → fiable au tactile. */}
      <span
        aria-hidden
        className="pointer-events-none inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground/70"
      >
        <CalendarDays className="h-4 w-4" />
      </span>
      {/* Input date natif transparent SUPERPOSÉ au bouton et RÉELLEMENT
          cliquable (pas de pointer-events:none). Un tap mobile ouvre alors le
          sélecteur natif directement — `showPicker()`/`focus()` programmatiques
          ne sont pas fiables sur iOS/Android. Le bouton iconique tente quand
          même showPicker() au clic desktop, en complément. */}
      <input
        ref={inputRef}
        type="date"
        value={selectedDate}
        onClick={handleClick}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
        aria-label="Choisir une date précise"
        title="Choisir une date précise"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
