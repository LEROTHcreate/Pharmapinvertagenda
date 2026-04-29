"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import type { AbsenceCode, ScheduleType, TaskCode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type ParsedCell = { employeeId: string; date: string; timeSlot: string };
function parseCellKey(k: CellKey): ParsedCell {
  const [employeeId, date, timeSlot] = k.split("|");
  return { employeeId, date, timeSlot };
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

  // Marque dirty au changement de nom (au-delà de l'init)
  useEffect(() => {
    if (name !== initialName) setDirty(true);
  }, [name, initialName]);

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

  // Reset selection quand on change de jour
  useEffect(() => {
    setMultiSelection(new Set());
  }, [selectedDay]);

  /** Mutation locale d'une entry (upsert ou supprime) */
  function upsertLocalEntry(
    employeeId: string,
    dayOfWeek: number,
    timeSlot: string,
    payload: { type: "TASK" | "ABSENCE"; taskCode?: TaskCode | null; absenceCode?: AbsenceCode | null } | null
  ) {
    setEntries((prev) => {
      const filtered = prev.filter(
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
          absenceCode:
            payload.type === "ABSENCE" ? payload.absenceCode ?? null : null,
        },
      ];
    });
    setDirty(true);
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
    cells.forEach((c) => {
      const dow = parseDayKey(c.date);
      upsertLocalEntry(c.employeeId, dow, c.timeSlot, payload);
    });
    setBulkOpen(false);
    setMultiSelection(new Set());
  }

  async function handleBulkClear() {
    const cells = Array.from(multiSelection).map(parseCellKey);
    cells.forEach((c) => {
      const dow = parseDayKey(c.date);
      upsertLocalEntry(c.employeeId, dow, c.timeSlot, null);
    });
    setBulkOpen(false);
    setMultiSelection(new Set());
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
    setSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: templateId, // undefined → création ; sinon update
          weekType,
          name: trimmedName,
          entries,
        }),
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
        title: templateId ? "Gabarit mis à jour" : "Gabarit créé",
        description: `« ${trimmedName} » enregistré.`,
      });
      // En création : on a obtenu un nouvel id → on passe en mode édition
      // pour que les sauvegardes suivantes mettent à jour ce gabarit.
      if (!templateId && data.templateId) {
        router.replace(`/gabarits/${data.templateId}/edit`);
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
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
    <div className="p-4 md:p-6 space-y-4">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
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

      {/* Onglets jours (sans dates, juste Lun-Sam) */}
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

      {/* Barre flottante multi-sélection */}
      {multiSelection.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border bg-card shadow-2xl px-4 py-2.5">
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
