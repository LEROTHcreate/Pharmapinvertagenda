"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Plus,
  Clock,
  Check,
  X,
  Trash2,
  Loader2,
  Hand,
  UserCheck,
} from "lucide-react";
import type { EmployeeStatus } from "@prisma/client";
import { TASK_LABELS, TIME_SLOTS } from "@/types";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type EmployeeRef = {
  id: string;
  firstName: string;
  lastName: string;
  status?: EmployeeStatus;
  displayColor: string;
};

type OpenShift = {
  id: string;
  date: string;
  startSlot: string;
  endSlot: string;
  taskCode: string | null;
  note: string | null;
  status: "OPEN" | "FILLED" | "CANCELLED";
  assignedEmployee: EmployeeRef | null;
  volunteers: EmployeeRef[];
};

// Fins possibles : de 08:00 à 20:00 (fermeture). Le début reste un créneau réel.
const END_SLOTS = [...TIME_SLOTS.slice(1), "20:00"];

// Postes proposés à la création (MAIL retiré de l'UI).
const TASK_OPTIONS = (Object.keys(TASK_LABELS) as Array<keyof typeof TASK_LABELS>).filter(
  (t) => t !== "MAIL"
);

function fullName(e: EmployeeRef) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function dateLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function CreneauxView({
  canManage,
  myEmployeeId,
  employees,
}: {
  canManage: boolean;
  myEmployeeId: string | null;
  employees: EmployeeRef[];
}) {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<OpenShift[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/open-shifts");
      const d = await res.json();
      setShifts(res.ok ? d.shifts ?? [] : []);
    } catch {
      setShifts([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const open = useMemo(() => (shifts ?? []).filter((s) => s.status === "OPEN"), [shifts]);
  const done = useMemo(
    () => (shifts ?? []).filter((s) => s.status !== "OPEN"),
    [shifts]
  );

  async function volunteer(s: OpenShift) {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/open-shifts/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "volunteer" }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast({ tone: "error", title: "Action impossible", description: e.error ?? "Réessaie." });
      } else {
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function assign(s: OpenShift, employeeId: string) {
    if (!employeeId) return;
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/open-shifts/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assign", employeeId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ tone: "error", title: "Assignation impossible", description: d.error ?? "Réessaie." });
      } else {
        toast({
          tone: "success",
          title: "Créneau pourvu",
          description: d.wroteEntries ? "Le planning a été rempli automatiquement." : undefined,
        });
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function cancelShift(s: OpenShift) {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/open-shifts/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(s: OpenShift) {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/open-shifts/${s.id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full p-3 md:p-4 lg:p-6 pb-16 max-w-4xl mx-auto">
      {/* En-tête */}
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Créneaux à couvrir
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {canManage
              ? "Signalez un trou de planning ; l'équipe se positionne, vous assignez."
              : "Positionnez-vous sur un créneau à pourvoir — un responsable validera."}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" /> Nouveau créneau
          </button>
        )}
      </header>

      {canManage && creating && (
        <CreateForm
          onDone={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}

      {shifts === null ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : open.length === 0 && done.length === 0 ? (
        <EmptyState canManage={canManage} />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
              À pourvoir ({open.length})
            </h2>
            {open.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
                Aucun créneau à pourvoir pour le moment. 👌
              </p>
            ) : (
              <ul className="space-y-3">
                {open.map((s) => (
                  <ShiftCard
                    key={s.id}
                    shift={s}
                    canManage={canManage}
                    myEmployeeId={myEmployeeId}
                    employees={employees}
                    busy={busyId === s.id}
                    onVolunteer={() => volunteer(s)}
                    onAssign={(empId) => assign(s, empId)}
                    onCancel={() => cancelShift(s)}
                    onRemove={() => remove(s)}
                  />
                ))}
              </ul>
            )}
          </section>

          {done.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
                Traités
              </h2>
              <ul className="space-y-3">
                {done.map((s) => (
                  <ShiftCard
                    key={s.id}
                    shift={s}
                    canManage={canManage}
                    myEmployeeId={myEmployeeId}
                    employees={employees}
                    busy={busyId === s.id}
                    onVolunteer={() => volunteer(s)}
                    onAssign={(empId) => assign(s, empId)}
                    onCancel={() => cancelShift(s)}
                    onRemove={() => remove(s)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ canManage }: { canManage: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <p className="mt-3 text-[14px] font-medium text-foreground">Aucun créneau à couvrir</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
        {canManage
          ? "Quand il manque quelqu'un sur un créneau, créez-le ici : l'équipe pourra se positionner."
          : "Rien à pourvoir pour l'instant. Repassez plus tard."}
      </p>
    </div>
  );
}

const STATUS_BADGE: Record<OpenShift["status"], { label: string; cls: string }> = {
  OPEN: {
    label: "À pourvoir",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  FILLED: {
    label: "Pourvu",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  CANCELLED: {
    label: "Annulé",
    cls: "bg-muted text-muted-foreground",
  },
};

function ShiftCard({
  shift: s,
  canManage,
  myEmployeeId,
  employees,
  busy,
  onVolunteer,
  onAssign,
  onCancel,
  onRemove,
}: {
  shift: OpenShift;
  canManage: boolean;
  myEmployeeId: string | null;
  employees: EmployeeRef[];
  busy: boolean;
  onVolunteer: () => void;
  onAssign: (employeeId: string) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const badge = STATUS_BADGE[s.status];
  const iAmIn = !!myEmployeeId && s.volunteers.some((v) => v.id === myEmployeeId);
  // Pré-sélection de l'assignation : 1er volontaire s'il y en a.
  const [pick, setPick] = useState<string>(s.volunteers[0]?.id ?? "");

  return (
    <li
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        s.status === "CANCELLED" && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold capitalize text-foreground">
            {dateLabel(s.date)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="tabular-nums">
              {s.startSlot} – {s.endSlot}
            </span>
            {s.taskCode && (
              <span className="ml-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                {TASK_LABELS[s.taskCode as keyof typeof TASK_LABELS] ?? s.taskCode}
              </span>
            )}
          </p>
          {s.note && <p className="mt-1 text-[12.5px] text-foreground/70">{s.note}</p>}
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", badge.cls)}>
          {badge.label}
        </span>
      </div>

      {/* Assigné */}
      {s.assignedEmployee && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-emerald-700 dark:text-emerald-300">
          <UserCheck className="h-4 w-4" /> Assigné à{" "}
          <strong>{fullName(s.assignedEmployee)}</strong>
        </p>
      )}

      {/* Volontaires */}
      {s.status === "OPEN" && (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {s.volunteers.length > 0
              ? `${s.volunteers.length} volontaire${s.volunteers.length > 1 ? "s" : ""}`
              : "Aucun volontaire"}
          </p>
          {s.volunteers.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {s.volunteers.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[12px]"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: v.displayColor }}
                  />
                  {fullName(v)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Collaborateur : se positionner */}
        {s.status === "OPEN" && myEmployeeId && (
          <button
            onClick={onVolunteer}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-60",
              iAmIn
                ? "border border-border text-muted-foreground hover:bg-muted/50"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : iAmIn ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Hand className="h-3.5 w-3.5" />
            )}
            {iAmIn ? "Me retirer" : "Je me positionne"}
          </button>
        )}

        {/* Manageur : assigner / annuler / supprimer */}
        {canManage && s.status === "OPEN" && (
          <>
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="rounded-lg border border-input bg-card px-2 py-1.5 text-[12.5px]"
            >
              <option value="">Choisir un collaborateur…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {fullName(e)}
                  {s.volunteers.some((v) => v.id === e.id) ? " ✋" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => onAssign(pick)}
              disabled={busy || !pick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Assigner
            </button>
            <button
              onClick={onCancel}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-60"
            >
              Annuler
            </button>
          </>
        )}

        {canManage && (
          <button
            onClick={onRemove}
            disabled={busy}
            title="Supprimer"
            className="ml-auto inline-flex items-center rounded-lg p-1.5 text-muted-foreground/60 hover:bg-muted/50 hover:text-red-600 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [startSlot, setStartSlot] = useState("09:00");
  const [endSlot, setEndSlot] = useState("12:00");
  const [taskCode, setTaskCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!date) {
      toast({ tone: "error", title: "Date manquante", description: "Choisis une date." });
      return;
    }
    if (endSlot <= startSlot) {
      toast({ tone: "error", title: "Horaires invalides", description: "La fin doit être après le début." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/open-shifts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          startSlot,
          endSlot,
          taskCode: taskCode || null,
          note: note || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ tone: "error", title: "Création impossible", description: d.error ?? "Réessaie." });
      } else {
        setDate("");
        setNote("");
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4 dark:border-violet-900/40 dark:bg-violet-950/10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
          Début
          <select
            value={startSlot}
            onChange={(e) => setStartSlot(e.target.value)}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground tabular-nums"
          >
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
          Fin
          <select
            value={endSlot}
            onChange={(e) => setEndSlot(e.target.value)}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground tabular-nums"
          >
            {END_SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
          Poste (optionnel)
          <select
            value={taskCode}
            onChange={(e) => setTaskCode(e.target.value)}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground"
          >
            <option value="">— Peu importe —</option>
            {TASK_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TASK_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
        Note (optionnel)
        <input
          type="text"
          value={note}
          maxLength={280}
          placeholder="Ex. renfort comptoir samedi matin"
          onChange={(e) => setNote(e.target.value)}
          className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground"
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Créer le créneau
        </button>
      </div>
    </div>
  );
}
