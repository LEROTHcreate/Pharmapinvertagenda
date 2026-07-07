"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Save,
  Loader2,
  Copy,
  ChevronDown,
  Undo2,
  Redo2,
  ClipboardCopy,
  ClipboardPaste,
  HelpCircle,
} from "lucide-react";
import type { AbsenceCode, ScheduleType, TaskCode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WEEK_DAYS, WEEK_DAYS_SHORT } from "@/types";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { indexEntriesByEmployee } from "@/lib/planning-utils";
import { PlanningGrid, type CellKey } from "@/components/planning/PlanningGrid";
import { TaskSelector } from "@/components/planning/TaskSelector";
import { BulkTaskSelector } from "@/components/planning/BulkTaskSelector";
import { useToast } from "@/components/ui/toast";

export type TemplateEntryDTO = {
  employeeId: string;
  dayOfWeek: number; // 0 = Lundi, 5 = Samedi
  timeSlot: string;
  type: ScheduleType;
  taskCode: TaskCode | null;
  absenceCode: AbsenceCode | null;
};

/** "Date" factice utilisée pour le réindexage côté grille */
const dayKey = (d: number) => `tpl-${d}`;
const parseDayKey = (k: string) => Number(k.replace("tpl-", ""));

type Selection = {
  employeeId: string;
  date: string;
  timeSlot: string;
} | null;

/**
 * Élément du presse-papiers : le contenu d'une cellule, VOLONTAIREMENT
 * jour-agnostique (on ne retient que l'employé + l'horaire + le poste). Le collage
 * réapplique donc le poste au même employé/horaire sur le jour affiché → sert à
 * répéter des postes d'un jour à l'autre dans la semaine.
 */
type ClipItem = {
  employeeId: string;
  timeSlot: string;
  payload:
    | { type: "TASK" | "ABSENCE"; taskCode: TaskCode | null; absenceCode: AbsenceCode | null }
    | null;
};

/** Liste des raccourcis affichés dans l'aide (touche « ? »). */
const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "Ctrl / ⌘ + Z", label: "Annuler la dernière action" },
  { keys: "Ctrl + Y  ·  Ctrl / ⌘ + Maj + Z", label: "Rétablir" },
  { keys: "Ctrl / ⌘ + C", label: "Copier les cellules sélectionnées" },
  { keys: "Ctrl / ⌘ + V", label: "Coller sur le jour affiché" },
  { keys: "Suppr  ·  ⌫", label: "Vider les cellules sélectionnées" },
  { keys: "Échap", label: "Annuler la sélection en cours" },
  { keys: "?", label: "Afficher cette aide" },
];

type ParsedCell = { employeeId: string; date: string; timeSlot: string };
function parseCellKey(k: CellKey): ParsedCell {
  const [employeeId, date, timeSlot] = k.split("|");
  return { employeeId, date, timeSlot };
}

/**
 * Applique un upsert (ou une suppression si `payload` est null) sur une liste
 * d'entries et renvoie une NOUVELLE liste. Fonction pure : utilisée pour
 * construire un état complet à confirmer d'un coup dans l'historique
 * (annuler / rétablir), y compris pour les actions multi-cellules.
 */
function applyUpsert(
  list: TemplateEntryDTO[],
  employeeId: string,
  dayOfWeek: number,
  timeSlot: string,
  payload:
    | { type: "TASK" | "ABSENCE"; taskCode?: TaskCode | null; absenceCode?: AbsenceCode | null }
    | null
): TemplateEntryDTO[] {
  const filtered = list.filter(
    (e) =>
      !(
        e.employeeId === employeeId &&
        e.dayOfWeek === dayOfWeek &&
        e.timeSlot === timeSlot
      )
  );
  if (!payload) return filtered;
  return [
    ...filtered,
    {
      employeeId,
      dayOfWeek,
      timeSlot,
      type: payload.type,
      taskCode: payload.type === "TASK" ? payload.taskCode ?? null : null,
      absenceCode: payload.type === "ABSENCE" ? payload.absenceCode ?? null : null,
    },
  ];
}

/** Convertit les TemplateEntryDTO en ScheduleEntryDTO factices (date = "tpl-0".."tpl-5") */
function toFakeScheduleEntries(entries: TemplateEntryDTO[]): ScheduleEntryDTO[] {
  return entries.map((e, i) => ({
    id: `tpl-${i}`,
    employeeId: e.employeeId,
    date: dayKey(e.dayOfWeek),
    timeSlot: e.timeSlot,
    type: e.type,
    taskCode: e.taskCode,
    absenceCode: e.absenceCode,
    notes: null,
  }));
}

export function TemplateView({
  templateId,
  weekType,
  initialName,
  employees,
  initialEntries,
}: {
  /** Si défini : édition d'un gabarit existant. Sinon : création. */
  templateId?: string;
  weekType: "S1" | "S2";
  initialName: string;
  employees: EmployeeDTO[];
  initialEntries: TemplateEntryDTO[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [entries, setEntries] = useState<TemplateEntryDTO[]>(initialEntries);
  const [name, setName] = useState(initialName);
  const [dayIndex, setDayIndex] = useState(0); // Lun par défaut
  const [selection, setSelection] = useState<Selection>(null);
  const [multiSelection, setMultiSelection] = useState<Set<CellKey>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Confirmation avant de quitter le gabarit avec des modifs non enregistrées.
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Destination en attente de confirmation (lien intercepté), ou null.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // Panneau d'aide des raccourcis clavier.
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ─── Historique annuler / rétablir ─────────────────────────────────────
  // Le gabarit vit en state local (pas dans le store Zustand du planning) : on
  // gère donc ici deux piles de snapshots de `entries`. Chaque ACTION utilisateur
  // (édition d'une cellule, application groupée, duplication de jour) = un pas.
  // `entriesRef` reflète toujours `entries` au rendu → lecture synchrone fiable
  // dans les handlers et les piles, sans dépendre d'un re-render.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [past, setPast] = useState<TemplateEntryDTO[][]>([]);
  const [future, setFuture] = useState<TemplateEntryDTO[][]>([]);
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  // Presse-papiers de postes (jour-agnostique) : copier une sélection puis la
  // coller sur un autre jour aux mêmes positions employé/horaire.
  const [clipboard, setClipboard] = useState<ClipItem[]>([]);

  /** Confirme un nouvel état d'entries en empilant l'ancien dans l'historique. */
  const commit = useCallback((next: TemplateEntryDTO[]) => {
    // On borne la pile à 50 pas pour éviter de retenir de gros gabarits en boucle.
    setPast((p) => [...p.slice(-49), entriesRef.current]);
    setFuture([]); // toute nouvelle action invalide la pile « rétablir »
    entriesRef.current = next;
    setEntries(next);
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setFuture((f) => [...f, entriesRef.current]);
    setPast((p) => p.slice(0, -1));
    entriesRef.current = prev;
    setEntries(prev);
    setDirty(true);
  }, [past]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setPast((p) => [...p, entriesRef.current]);
    setFuture((f) => f.slice(0, -1));
    entriesRef.current = next;
    setEntries(next);
    setDirty(true);
  }, [future]);

  /** Copie le contenu de la sélection courante dans le presse-papiers. */
  const copySelection = useCallback(() => {
    const cells = Array.from(multiSelection).map(parseCellKey);
    if (cells.length === 0) return;
    const items: ClipItem[] = cells.map((c) => {
      const dow = parseDayKey(c.date);
      const existing = entriesRef.current.find(
        (e) =>
          e.employeeId === c.employeeId &&
          e.dayOfWeek === dow &&
          e.timeSlot === c.timeSlot
      );
      return {
        employeeId: c.employeeId,
        timeSlot: c.timeSlot,
        payload: existing
          ? {
              type: existing.type,
              taskCode: existing.taskCode,
              absenceCode: existing.absenceCode,
            }
          : null,
      };
    });
    setClipboard(items);
    toast({
      tone: "success",
      title: `${items.length} cellule(s) copiée(s)`,
      description: "Ctrl+V pour coller sur le jour affiché.",
    });
  }, [multiSelection, toast]);

  /**
   * Colle le presse-papiers sur le JOUR AFFICHÉ, aux mêmes positions
   * employé/horaire. Les cellules copiées vides effacent la cible (copie fidèle
   * du bloc, à la manière d'un tableur). Un seul pas d'historique.
   */
  const pasteToCurrentDay = useCallback(() => {
    if (clipboard.length === 0) return;
    let next = entriesRef.current;
    clipboard.forEach((item) => {
      next = applyUpsert(next, item.employeeId, dayIndex, item.timeSlot, item.payload);
    });
    commit(next);
    toast({
      tone: "success",
      title: `Collé sur ${WEEK_DAYS[dayIndex]}`,
      description: `${clipboard.length} cellule(s).`,
    });
  }, [clipboard, dayIndex, commit, toast]);

  /** Vide les cellules sélectionnées (Suppr / ⌫) — un seul pas d'historique. */
  const deleteSelectedCells = useCallback(() => {
    const cells = Array.from(multiSelection).map(parseCellKey);
    if (cells.length === 0) return;
    let next = entriesRef.current;
    cells.forEach((c) => {
      next = applyUpsert(next, c.employeeId, parseDayKey(c.date), c.timeSlot, null);
    });
    commit(next);
    setMultiSelection(new Set());
  }, [multiSelection, commit]);

  // Marque dirty au changement de nom (au-delà de l'init)
  useEffect(() => {
    if (name !== initialName) setDirty(true);
  }, [name, initialName]);

  // Garde-fou navigateur : prévient à la fermeture / au rafraîchissement de
  // l'onglet tant qu'il reste des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = ""; // requis par certains navigateurs pour afficher l'invite
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Garde-fou navigation interne : tant qu'il reste des modifs non enregistrées,
  // on intercepte (phase capture) tout clic sur un lien interne — barre latérale,
  // bouton Retour, etc. — pour demander confirmation avant de quitter la page.
  useEffect(() => {
    if (!dirty) return;
    function onClickCapture(e: MouseEvent) {
      if (e.defaultPrevented) return;
      // On laisse passer les clics « ouvrir dans un onglet » (Ctrl/⌘/Maj/clic milieu).
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      // Liens internes uniquement (on ignore externes, ancres, target=_blank).
      if (!href || !href.startsWith("/")) return;
      if (anchor.getAttribute("target") === "_blank") return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
      setConfirmLeave(true);
    }
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [dirty]);

  const dayDates = useMemo(() => [0, 1, 2, 3, 4, 5].map(dayKey), []);
  const selectedDay = dayDates[dayIndex];

  const fakeEntries = useMemo(() => toFakeScheduleEntries(entries), [entries]);
  const index = useMemo(() => indexEntriesByEmployee(fakeEntries), [fakeEntries]);

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

  // Raccourcis annuler / rétablir (Ctrl/⌘+Z, Ctrl+Y ou Ctrl/⌘+Shift+Z) —
  // mêmes gestes que l'éditeur de planning. On ignore la frappe si le focus est
  // dans un champ de saisie (ex. le nom du gabarit) pour ne pas casser l'undo natif.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const isUndo = !e.shiftKey && key === "z";
      const isRedo = (!e.shiftKey && key === "y") || (e.shiftKey && key === "z");
      if (!isUndo && !isRedo) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      e.preventDefault();
      if (isUndo) undo();
      else redo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Copier / coller des postes (Ctrl/⌘+C, Ctrl/⌘+V). Ctrl+C ne s'active que si des
  // cellules sont sélectionnées ET qu'aucun texte n'est sélectionné (on laisse le
  // copier-coller de texte natif) ; Ctrl+V que si le presse-papiers a du contenu.
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
      if (key === "c") {
        if (multiSelection.size === 0) return;
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) return; // laisse copier du texte
        e.preventDefault();
        copySelection();
      } else {
        if (clipboard.length === 0) return;
        e.preventDefault();
        pasteToCurrentDay();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [multiSelection.size, clipboard.length, copySelection, pasteToCurrentDay]);

  // Suppr / ⌫ = vider la sélection ; « ? » = ouvrir/fermer l'aide raccourcis.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inField) return;
      if ((e.key === "Delete" || e.key === "Backspace") && multiSelection.size > 0) {
        e.preventDefault();
        deleteSelectedCells();
      } else if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [multiSelection.size, deleteSelectedCells]);

  // Reset selection quand on change de jour
  useEffect(() => {
    setMultiSelection(new Set());
  }, [selectedDay]);

  /** Mutation locale d'une entry (upsert ou supprime) → un pas d'historique. */
  function upsertLocalEntry(
    employeeId: string,
    dayOfWeek: number,
    timeSlot: string,
    payload: { type: "TASK" | "ABSENCE"; taskCode?: TaskCode | null; absenceCode?: AbsenceCode | null } | null
  ) {
    commit(applyUpsert(entriesRef.current, employeeId, dayOfWeek, timeSlot, payload));
  }

  function handleCellClick(employeeId: string, date: string, timeSlot: string) {
    setSelection({ employeeId, date, timeSlot });
  }

  // Note : `scope`/`weeks` ne s'appliquent pas aux gabarits — ils sont
  // ignorés, on modifie uniquement le gabarit local.
  function handleSingleSave(payload: {
    type: "TASK" | "ABSENCE";
    taskCode?: string | null;
    absenceCode?: string | null;
  }) {
    if (!selection) return Promise.resolve();
    const dow = parseDayKey(selection.date);
    upsertLocalEntry(selection.employeeId, dow, selection.timeSlot, {
      type: payload.type,
      taskCode: payload.taskCode as TaskCode | null | undefined,
      absenceCode: payload.absenceCode as AbsenceCode | null | undefined,
    });
    setSelection(null);
    return Promise.resolve();
  }

  function handleSingleClear() {
    if (!selection) return Promise.resolve();
    const dow = parseDayKey(selection.date);
    upsertLocalEntry(selection.employeeId, dow, selection.timeSlot, null);
    setSelection(null);
    return Promise.resolve();
  }

  async function handleBulkApply(payload: {
    type: "TASK" | "ABSENCE";
    taskCode?: TaskCode | null;
    absenceCode?: AbsenceCode | null;
  }) {
    const cells = Array.from(multiSelection).map(parseCellKey);
    // On construit l'état complet cible puis on confirme d'un coup → un seul pas
    // d'historique pour toute l'application groupée (undo = tout restaurer).
    let next = entriesRef.current;
    cells.forEach((c) => {
      next = applyUpsert(next, c.employeeId, parseDayKey(c.date), c.timeSlot, payload);
    });
    commit(next);
    setBulkOpen(false);
    setMultiSelection(new Set());
  }

  async function handleBulkClear() {
    const cells = Array.from(multiSelection).map(parseCellKey);
    let next = entriesRef.current;
    cells.forEach((c) => {
      next = applyUpsert(next, c.employeeId, parseDayKey(c.date), c.timeSlot, null);
    });
    commit(next);
    setBulkOpen(false);
    setMultiSelection(new Set());
  }

  /**
   * Duplique le contenu du jour courant (dayIndex) vers les jours cibles.
   * Les entrées existantes sur les jours cibles sont écrasées.
   */
  function duplicateDayTo(targetDays: number[]) {
    if (targetDays.length === 0) return;
    const sourceDay = dayIndex;
    const prev = entriesRef.current;
    const sourceEntries = prev.filter((e) => e.dayOfWeek === sourceDay);
    const targetSet = new Set(targetDays);
    // 1. Retire les entrées existantes sur les jours cibles
    const cleaned = prev.filter((e) => !targetSet.has(e.dayOfWeek));
    // 2. Recopie les entrées source pour chaque jour cible
    const copies = targetDays.flatMap((td) =>
      sourceEntries.map((e) => ({ ...e, dayOfWeek: td }))
    );
    commit([...cleaned, ...copies]);
    const labels = targetDays.map((d) => WEEK_DAYS_SHORT[d]).join(", ");
    toast({
      tone: "success",
      title: `Jour ${WEEK_DAYS_SHORT[sourceDay]} dupliqué`,
      description: `Vers : ${labels}`,
    });
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({
        tone: "warning",
        title: "Nom requis",
        description: "Donne un nom à ce gabarit avant d'enregistrer.",
      });
      return;
    }

    // ─── Optimistic save : on prétend que ça a marché instantanément ───
    // Pour un gabarit de 1000 entries, le POST prend 500-1500ms. Sans
    // optimistic, l'utilisateur voit le spinner pendant tout ce temps
    // alors que ses modifs sont déjà valides (uniquement du state local).
    // Si le serveur refuse, on remet `dirty=true` et on affiche l'erreur.
    //
    // Cas spécial : pour une CRÉATION, on a besoin du nouvel id renvoyé
    // par le serveur pour rediriger → on garde le mode bloquant pour ce
    // cas seulement (rare, premier save uniquement).
    const isCreate = !templateId;

    if (isCreate) {
      // Création : mode bloquant car on a besoin de l'id retourné
      setSaving(true);
      try {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ weekType, name: trimmedName, entries }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({
            tone: "error",
            title: "Sauvegarde impossible",
            description: data.error ?? "Une erreur est survenue.",
          });
          return;
        }
        setDirty(false);
        toast({
          tone: "success",
          title: "Gabarit créé",
          description: `« ${trimmedName} » enregistré.`,
        });
        if (data.templateId) {
          router.replace(`/gabarits/${data.templateId}/edit`);
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    // ─── Update existant : optimistic ───
    setDirty(false);
    toast({
      tone: "success",
      title: "Gabarit mis à jour",
      description: `« ${trimmedName} » enregistré.`,
    });

    // Fire-and-forget. En cas d'échec, on remet dirty=true et on prévient.
    fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: templateId, weekType, name: trimmedName, entries }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setDirty(true);
          toast({
            tone: "error",
            title: "Sauvegarde échouée",
            description: data.error ?? "Réessaie l'enregistrement.",
          });
        }
      })
      .catch(() => {
        setDirty(true);
        toast({
          tone: "error",
          title: "Réseau indisponible",
          description: "Tes modifs ne sont pas sauvegardées. Réessaie.",
        });
      });
  }

  const selectedEmployee = useMemo(
    () => (selection ? employees.find((e) => e.id === selection.employeeId) ?? null : null),
    [selection, employees]
  );

  const selectedEntry = useMemo(() => {
    if (!selection) return null;
    return (
      fakeEntries.find(
        (e) =>
          e.employeeId === selection.employeeId &&
          e.date === selection.date &&
          e.timeSlot === selection.timeSlot
      ) ?? null
    );
  }, [selection, fakeEntries]);

  const selectedCells = useMemo(
    () => Array.from(multiSelection).map(parseCellKey),
    [multiSelection]
  );

  return (
    <div className="p-3 md:p-4 space-y-4">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            {/* La confirmation « modifs non enregistrées » est gérée globalement
                par l'intercepteur de clics (garde-fou navigation ci-dessus). */}
            <Link href="/gabarits">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                {weekType}
              </span>
              <span className="text-[11px] text-zinc-400">
                {templateId ? "Édition" : "Nouveau gabarit"}
              </span>
            </div>
            <Input
              type="text"
              placeholder={`Nom du gabarit (ex : ${weekType} standard)`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="mt-1 h-9 max-w-md border-0 border-b border-zinc-200 bg-transparent px-0 text-xl font-bold tracking-tight shadow-none focus-visible:border-violet-500 focus-visible:ring-0 md:text-2xl"
            />
            <p className="text-sm text-muted-foreground mt-0.5">
              Définis le planning idéal — il sera appliqué à la semaine de ton choix.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Aide des raccourcis clavier (aussi via la touche « ? ») */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setShowShortcuts(true)}
            title="Raccourcis clavier (?)"
            aria-label="Raccourcis clavier"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          {/* Annuler / rétablir — raccourcis Ctrl+Z / Ctrl+Y (ou ⌘) */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={undo}
              disabled={!canUndo}
              title="Annuler (Ctrl+Z)"
              aria-label="Annuler"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={redo}
              disabled={!canRedo}
              title="Rétablir (Ctrl+Y)"
              aria-label="Rétablir"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          {dirty && (
            <span className="text-xs italic text-amber-600">
              · Modifications non enregistrées
            </span>
          )}
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </div>
      </div>

      {/* Onglets jours + bouton "Dupliquer ce jour" */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={String(dayIndex)} onValueChange={(v) => setDayIndex(Number(v))}>
          <TabsList className="w-full justify-start overflow-x-auto h-auto p-1">
            {WEEK_DAYS.map((label, i) => (
              <TabsTrigger
                key={i}
                value={String(i)}
                className="flex-col gap-0.5 h-auto py-2 px-3 min-w-[72px]"
              >
                <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{WEEK_DAYS_SHORT[i]}</span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 shrink-0">
        {/* Coller le presse-papiers sur le jour affiché (visible dès qu'on a copié) */}
        {clipboard.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={pasteToCurrentDay}
            title={`Coller ${clipboard.length} cellule(s) sur ${WEEK_DAYS[dayIndex]} (Ctrl+V)`}
          >
            <ClipboardPaste className="h-4 w-4" />
            Coller ({clipboard.length})
          </Button>
        )}

        {/* Dropdown : dupliquer le jour courant vers… */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <Copy className="h-4 w-4" />
              Dupliquer ce jour
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px]">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-zinc-500">
              Copier {WEEK_DAYS[dayIndex]} vers…
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {WEEK_DAYS.map((label, i) =>
              i === dayIndex ? null : (
                <DropdownMenuItem
                  key={i}
                  onClick={() => duplicateDayTo([i])}
                  className="cursor-pointer"
                >
                  {label}
                </DropdownMenuItem>
              )
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={dayIndex >= 5}
              onClick={() =>
                duplicateDayTo(
                  WEEK_DAYS.map((_, i) => i).filter((i) => i > dayIndex)
                )
              }
              className="cursor-pointer font-medium"
            >
              Tous les jours suivants
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                duplicateDayTo(
                  WEEK_DAYS.map((_, i) => i).filter((i) => i !== dayIndex)
                )
              }
              className="cursor-pointer font-medium text-violet-700"
            >
              Toute la semaine
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {/* Grille (réutilise PlanningGrid avec dates factices) */}
      <PlanningGrid
        employees={employees}
        date={selectedDay}
        weekDates={dayDates}
        index={index}
        canEdit={true}
        minStaff={4}
        selection={multiSelection}
        onSelectionChange={setMultiSelection}
        onCellClick={handleCellClick}
      />

      {/* Modaux */}
      {selection && selectedEmployee && (
        <TaskSelector
          open={!!selection}
          employee={selectedEmployee}
          date={selection.date}
          timeSlot={selection.timeSlot}
          currentEntry={selectedEntry}
          onClose={() => setSelection(null)}
          onSave={handleSingleSave}
          onClear={handleSingleClear}
        />
      )}

      <BulkTaskSelector
        open={bulkOpen}
        cells={selectedCells}
        employees={employees}
        onClose={() => setBulkOpen(false)}
        onApply={handleBulkApply}
        onClearAll={handleBulkClear}
      />

      {/* Confirmation avant de quitter avec des modifications non enregistrées */}
      <ConfirmDialog
        open={confirmLeave}
        variant="destructive"
        title="Modifications non enregistrées"
        description="Ce gabarit contient des changements qui n'ont pas encore été enregistrés. Vérifie qu'il est bien sauvegardé (bouton « Enregistrer ») avant de partir, sinon ton travail sera perdu."
        confirmLabel="Quitter sans enregistrer"
        cancelLabel="Rester sur le gabarit"
        onConfirm={() => {
          const href = pendingHref ?? "/gabarits";
          setConfirmLeave(false);
          setPendingHref(null);
          router.push(href);
        }}
        onClose={() => {
          setConfirmLeave(false);
          setPendingHref(null);
        }}
      />

      {/* Aide-mémoire des raccourcis clavier (touche « ? ») */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raccourcis clavier</DialogTitle>
            <DialogDescription>
              Pour éditer le gabarit plus vite au clavier.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5">
            {SHORTCUTS.map((s) => (
              <li
                key={s.keys}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="text-muted-foreground">{s.label}</span>
                <kbd className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11px] font-medium">
                  {s.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Barre flottante multi-sélection */}
      {multiSelection.size > 0 && (
        <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border bg-card shadow-2xl px-4 py-2.5">
          <span className="text-sm">
            <span className="font-semibold">{multiSelection.size}</span>{" "}
            <span className="text-muted-foreground">sélectionné(s)</span>
          </span>
          <div className="h-5 w-px bg-border" />
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            Appliquer un poste
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={copySelection}
            title="Copier la sélection (Ctrl+C) — collable sur un autre jour"
          >
            <ClipboardCopy className="h-4 w-4" />
            Copier
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMultiSelection(new Set())}
          >
            Annuler
          </Button>
        </div>
      )}
    </div>
  );
}
