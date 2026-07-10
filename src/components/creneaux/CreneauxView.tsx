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
  BellRing,
  CalendarDays,
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
  /** Le collaborateur courant travaille-t-il déjà ce jour-là ? (bloque le vote) */
  iWorkThatDay: boolean;
  /** IDs des employés qui travaillent déjà ce jour-là (flag menu, responsables). */
  workingEmployeeIds: string[] | null;
};

const END_SLOTS = [...TIME_SLOTS.slice(1), "20:00"];
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
/** "aujourd'hui / demain / dans N j" à partir de la date ISO. */
function relDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "passé";
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days <= 7) return `dans ${days} j`;
  return "";
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
  const done = useMemo(() => (shifts ?? []).filter((s) => s.status !== "OPEN"), [shifts]);

  async function patch(s: OpenShift, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(`/api/open-shifts/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function volunteer(s: OpenShift) {
    setBusyId(s.id);
    try {
      const { ok, data } = await patch(s, { action: "volunteer" });
      if (!ok) toast({ tone: "error", title: "Action impossible", description: (data.error as string) ?? "Réessaie." });
      else await load();
    } finally {
      setBusyId(null);
    }
  }

  async function assign(s: OpenShift, employeeId: string) {
    if (!employeeId) return;
    setBusyId(s.id);
    try {
      const { ok, data } = await patch(s, { action: "assign", employeeId });
      if (!ok) toast({ tone: "error", title: "Assignation impossible", description: (data.error as string) ?? "Réessaie." });
      else {
        toast({
          tone: "success",
          title: "Créneau pourvu",
          description: data.wroteEntries ? "Le planning a été rempli automatiquement." : undefined,
        });
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function notify(s: OpenShift) {
    setBusyId(s.id);
    try {
      const { ok, data } = await patch(s, { action: "notify" });
      if (ok)
        toast({
          tone: "success",
          title: "Équipe prévenue",
          description:
            (data.sent as number) > 0
              ? `${data.sent} notification${(data.sent as number) > 1 ? "s" : ""} envoyée${(data.sent as number) > 1 ? "s" : ""}.`
              : "Personne n'a encore activé les notifications.",
        });
      else toast({ tone: "error", title: "Envoi impossible", description: (data.error as string) ?? "Réessaie." });
    } finally {
      setBusyId(null);
    }
  }

  async function cancelShift(s: OpenShift) {
    setBusyId(s.id);
    try {
      const { ok } = await patch(s, { action: "cancel" });
      if (ok) await load();
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

  const cardProps = (s: OpenShift) => ({
    shift: s,
    canManage,
    myEmployeeId,
    employees,
    busy: busyId === s.id,
    onVolunteer: () => volunteer(s),
    onAssign: (empId: string) => assign(s, empId),
    onNotify: () => notify(s),
    onCancel: () => cancelShift(s),
    onRemove: () => remove(s),
  });

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Créneaux à couvrir</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {canManage
                ? "Signalez un trou de planning ; l'équipe se positionne, vous assignez en un clic."
                : "Positionnez-vous sur un créneau à pourvoir — un responsable validera."}
            </p>
          </div>
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
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : open.length === 0 && done.length === 0 ? (
        <EmptyState canManage={canManage} onCreate={() => setCreating(true)} />
      ) : (
        <div className="space-y-6">
          <Section label="À pourvoir" count={open.length}>
            {open.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
                Aucun créneau à pourvoir pour le moment. 👌
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {open.map((s) => (
                  <ShiftCard key={s.id} {...cardProps(s)} />
                ))}
              </div>
            )}
          </Section>

          {done.length > 0 && (
            <Section label="Traités" count={done.length}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {done.map((s) => (
                  <ShiftCard key={s.id} {...cardProps(s)} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
        {label} ({count})
      </h2>
      {children}
    </section>
  );
}

function EmptyState({ canManage, onCreate }: { canManage: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <ClipboardList className="mx-auto h-9 w-9 text-muted-foreground/50" />
      <p className="mt-3 text-[15px] font-medium text-foreground">Aucun créneau à couvrir</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
        {canManage
          ? "Quand il manque quelqu'un sur un créneau, créez-le ici : l'équipe pourra se positionner en un tap."
          : "Rien à pourvoir pour l'instant. Repassez plus tard."}
      </p>
      {canManage && (
        <button
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" /> Créer un créneau
        </button>
      )}
    </div>
  );
}

const STATUS_BADGE: Record<OpenShift["status"], { label: string; cls: string }> = {
  OPEN: { label: "À pourvoir", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  FILLED: { label: "Pourvu", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  CANCELLED: { label: "Annulé", cls: "bg-muted text-muted-foreground" },
};

function ShiftCard({
  shift: s,
  canManage,
  myEmployeeId,
  employees,
  busy,
  onVolunteer,
  onAssign,
  onNotify,
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
  onNotify: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const badge = STATUS_BADGE[s.status];
  const iAmIn = !!myEmployeeId && s.volunteers.some((v) => v.id === myEmployeeId);
  const [pick, setPick] = useState<string>(s.volunteers[0]?.id ?? "");
  const rel = relDay(s.date);
  const isOpen = s.status === "OPEN";

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        isOpen ? "border-amber-200/70 dark:border-amber-900/40" : "border-border",
        s.status === "CANCELLED" && "opacity-60"
      )}
    >
      {/* Date + statut */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[14.5px] font-semibold capitalize text-foreground">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            {dateLabel(s.date)}
            {rel && isOpen && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-medium normal-case text-muted-foreground">
                {rel}
              </span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="tabular-nums font-medium text-foreground">
              {s.startSlot} – {s.endSlot}
            </span>
            {s.taskCode && (
              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                {TASK_LABELS[s.taskCode as keyof typeof TASK_LABELS] ?? s.taskCode}
              </span>
            )}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", badge.cls)}>
          {badge.label}
        </span>
      </div>

      {s.note && <p className="mt-2 text-[12.5px] text-foreground/70">{s.note}</p>}

      {/* Assigné */}
      {s.assignedEmployee && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 dark:text-emerald-300">
          <UserCheck className="h-4 w-4" /> {fullName(s.assignedEmployee)}
        </p>
      )}

      {/* Volontaires */}
      {isOpen && (
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
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px]",
                    v.id === myEmployeeId
                      ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                      : "border-border bg-muted/40"
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: v.displayColor }} />
                  {fullName(v)}
                  {v.id === myEmployeeId && " (moi)"}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        {isOpen && myEmployeeId && (
          s.iWorkThatDay && !iAmIn ? (
            <p className="rounded-lg bg-muted/60 px-3 py-1.5 text-[12px] text-muted-foreground">
              Tu travailles déjà ce jour-là.
            </p>
          ) : (
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
          )
        )}

        {canManage && isOpen && (
          <>
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-input bg-card px-2 py-1.5 text-[12.5px]"
            >
              <option value="">Assigner à…</option>
              {employees.map((e) => {
                const worksThatDay = s.workingEmployeeIds?.includes(e.id);
                return (
                  <option key={e.id} value={e.id}>
                    {fullName(e)}
                    {s.volunteers.some((v) => v.id === e.id) ? " ✋" : ""}
                    {worksThatDay ? " · travaille déjà" : ""}
                  </option>
                );
              })}
            </select>
            <button
              onClick={() => onAssign(pick)}
              disabled={busy || !pick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Assigner
            </button>
          </>
        )}
      </div>

      {/* Barre responsable secondaire */}
      {canManage && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2">
          {isOpen && (
            <button
              onClick={onNotify}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[12px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-60 dark:bg-violet-950/40 dark:text-violet-300"
              title="Notifier l'équipe par push"
            >
              <BellRing className="h-3.5 w-3.5" /> Prévenir l'équipe
            </button>
          )}
          {isOpen && (
            <button
              onClick={onCancel}
              disabled={busy}
              className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted/60 disabled:opacity-60"
            >
              Annuler
            </button>
          )}
          <button
            onClick={onRemove}
            disabled={busy}
            title="Supprimer"
            className="ml-auto rounded-md p-1.5 text-muted-foreground/70 hover:bg-muted/60 hover:text-red-600 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
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
        body: JSON.stringify({ date, startSlot, endSlot, taskCode: taskCode || null, note: note || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) toast({ tone: "error", title: "Création impossible", description: d.error ?? "Réessaie." });
      else {
        setDate("");
        setNote("");
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4 dark:border-violet-900/40 dark:bg-violet-950/10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground"
          />
        </Field>
        <Field label="Début">
          <select
            value={startSlot}
            onChange={(e) => setStartSlot(e.target.value)}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground tabular-nums"
          >
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Fin">
          <select
            value={endSlot}
            onChange={(e) => setEndSlot(e.target.value)}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground tabular-nums"
          >
            {END_SLOTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Poste (optionnel)">
          <select
            value={taskCode}
            onChange={(e) => setTaskCode(e.target.value)}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground"
          >
            <option value="">— Peu importe —</option>
            {TASK_OPTIONS.map((t) => (
              <option key={t} value={t}>{TASK_LABELS[t]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Note (optionnel)" className="mt-3">
        <input
          type="text"
          value={note}
          maxLength={280}
          placeholder="Ex. renfort comptoir samedi matin"
          onChange={(e) => setNote(e.target.value)}
          className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground"
        />
      </Field>
      <div className="mt-3">
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

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-[12px] font-medium text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}
