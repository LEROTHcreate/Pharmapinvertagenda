"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Crown,
  Link2,
  Loader2,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { EmployeeStatus, UserRole } from "@prisma/client";
import {
  assignableRoles,
  canManageUser,
  isCreator,
  roleLabel,
  type AppRole,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/types";
import { AvatarImage } from "@/components/layout/AvatarImage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type EmployeeRef = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  /** Couleur planning du collaborateur (présente sur les fiches utilisées dans la liste). */
  displayColor?: string | null;
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "PENDING" | "APPROVED" | "REJECTED";
  isActive: boolean;
  /** Avatar choisi par l'utilisateur (cf. src/lib/avatars.ts). */
  avatarId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectionNote: string | null;
  isCurrentUser: boolean;
  employee: EmployeeRef | null;
};

export type EmployeeOption = EmployeeRef & {
  /** ID de l'utilisateur déjà lié à ce collaborateur, le cas échéant. */
  linkedUserId: string | null;
};

export function UsersAdmin({
  users,
  employees,
  currentUserRole,
}: {
  users: UserRow[];
  employees: EmployeeOption[];
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  // Rôles que l'acteur a le droit d'attribuer (jamais CREATEUR).
  const assignable = assignableRoles(currentUserRole);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Collaborateur sélectionné pour chaque demande en attente (clé: userId, valeur: employeeId ou "")
  const [selectedEmployee, setSelectedEmployee] = useState<
    Record<string, string>
  >({});

  // Sélection multiple des demandes en attente pour traitement en masse
  // (approuver comme collaborateurs / refuser plusieurs d'un coup).
  const [selectedPending, setSelectedPending] = useState<Set<string>>(
    new Set()
  );
  const [bulkBusy, setBulkBusy] = useState(false);

  // Confirmation de refus avec motif optionnel.
  const [rejectTarget, setRejectTarget] = useState<UserRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Confirmation de suppression définitive
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // Modification du lien collaborateur d'un membre déjà approuvé.
  // editLinkTarget = l'utilisateur ciblé, editLinkValue = l'employeeId choisi
  // dans le select (string vide = "Aucun / délier").
  const [editLinkTarget, setEditLinkTarget] = useState<UserRow | null>(null);
  const [editLinkValue, setEditLinkValue] = useState<string>("");

  const { pending, members, rejected } = useMemo(() => {
    const p: UserRow[] = [];
    const m: UserRow[] = [];
    const r: UserRow[] = [];
    for (const u of users) {
      if (u.status === "PENDING") p.push(u);
      else if (u.status === "REJECTED") r.push(u);
      else m.push(u);
    }
    return { pending: p, members: m, rejected: r };
  }, [users]);

  async function approve(user: UserRow, role: AppRole) {
    setError(null);
    setBusyId(user.id);
    const employeeId = selectedEmployee[user.id] || null;
    try {
      const res = await fetch(`/api/users/${user.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "APPROVE", role, employeeId }),
      });
      if (!res.ok) throw new Error(await readError(res));
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message || "Erreur lors de l'approbation");
    } finally {
      setBusyId(null);
    }
  }

  /** Change le rôle de permission d'un membre déjà approuvé. */
  async function changeRole(user: UserRow, role: AppRole) {
    setError(null);
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await readError(res));
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message || "Erreur lors du changement de rôle");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(user: UserRow) {
    setError(null);
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const code = await readError(res);
        // Messages plus parlants pour les cas connus
        if (code === "LAST_ADMIN") {
          throw new Error(
            "Impossible de supprimer le dernier administrateur actif."
          );
        }
        if (code === "CANNOT_DELETE_SELF") {
          throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
        }
        throw new Error(code || "Erreur lors de la suppression");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  async function reject(user: UserRow, note: string) {
    setError(null);
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "REJECT",
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message || "Erreur lors du refus");
    } finally {
      setBusyId(null);
      setRejectTarget(null);
      setRejectNote("");
    }
  }

  function togglePending(userId: string) {
    setSelectedPending((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  /**
   * Traite en masse les demandes sélectionnées.
   * - "APPROVE_EMPLOYEE" : approuve chacune comme collaborateur (rôle EMPLOYEE),
   *   en respectant le collaborateur éventuellement choisi par carte. Le lien
   *   peut toujours être ajouté/corrigé plus tard depuis la liste des membres.
   * - "REJECT" : refuse chacune (sans motif — le refus individuel reste possible
   *   pour ajouter un motif).
   * Les appels sont parallélisés ; on agrège les échecs sans bloquer le reste.
   */
  async function bulkProcess(action: "APPROVE_EMPLOYEE" | "REJECT") {
    const ids = [...selectedPending];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/users/${id}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              action === "APPROVE_EMPLOYEE"
                ? {
                    decision: "APPROVE",
                    role: "COLLABORATEUR",
                    employeeId: selectedEmployee[id] || null,
                  }
                : { decision: "REJECT" }
            ),
          }).then(async (r) => {
            if (!r.ok) throw new Error(await readError(r));
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        setError(
          `${failed} demande${failed > 1 ? "s" : ""} sur ${ids.length} n'${
            failed > 1 ? "ont" : "a"
          } pas pu être traitée${failed > 1 ? "s" : ""}.`
        );
      }
      setSelectedPending(new Set());
      startTransition(() => router.refresh());
    } finally {
      setBulkBusy(false);
    }
  }

  /**
   * Met à jour le lien collaborateur d'un membre déjà approuvé.
   * employeeId = "" → on délie (envoie null à l'API).
   */
  async function updateEmployeeLink(user: UserRow, employeeId: string) {
    setError(null);
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employeeId || null }),
      });
      if (!res.ok) {
        const code = await readError(res);
        if (code === "EMPLOYEE_TAKEN") {
          throw new Error(
            "Ce collaborateur est déjà lié à un autre compte. Délie-le d'abord."
          );
        }
        if (code === "EMPLOYEE_NOT_FOUND") {
          throw new Error("Collaborateur introuvable.");
        }
        if (code === "NOT_APPROVED") {
          throw new Error(
            "Le compte n'est pas encore approuvé — passe par la file d'attente."
          );
        }
        throw new Error(code || "Erreur lors de la mise à jour du lien");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
      setEditLinkTarget(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="animate-shake rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </div>
      )}

      {/* === DEMANDES EN ATTENTE === */}
      <section>
        <SectionHeader
          title="Demandes en attente"
          count={pending.length}
          accent="amber"
          description="Examinez chaque demande et choisissez si l'utilisateur peut gérer le planning."
        />
        {pending.length === 0 ? (
          <EmptyState message="Aucune demande en attente." />
        ) : (
          <>
            {/* Barre d'actions groupées — visible dès qu'une demande est cochée */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-foreground/80">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-violet-600"
                  checked={
                    selectedPending.size === pending.length && pending.length > 0
                  }
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selectedPending.size > 0 &&
                        selectedPending.size < pending.length;
                  }}
                  onChange={(e) =>
                    setSelectedPending(
                      e.target.checked
                        ? new Set(pending.map((u) => u.id))
                        : new Set()
                    )
                  }
                  disabled={bulkBusy}
                />
                {selectedPending.size > 0
                  ? `${selectedPending.size} sélectionnée${selectedPending.size > 1 ? "s" : ""}`
                  : "Tout sélectionner"}
              </label>

              {selectedPending.size > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => bulkProcess("APPROVE_EMPLOYEE")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                    title="Approuver les demandes sélectionnées comme collaborateurs"
                  >
                    {bulkBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Approuver collaborateur
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => bulkProcess("REJECT")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12.5px] font-medium text-foreground/85 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" />
                    Refuser
                  </button>
                </div>
              )}
            </div>

            <ul className="space-y-3">
              {pending.map((u) => (
                <PendingCard
                  key={u.id}
                  user={u}
                  employees={employees}
                  selected={selectedPending.has(u.id)}
                  onToggleSelect={() => togglePending(u.id)}
                  selectedEmployeeId={selectedEmployee[u.id] ?? ""}
                  onSelectEmployee={(empId) =>
                    setSelectedEmployee((prev) => ({ ...prev, [u.id]: empId }))
                  }
                  busy={busyId === u.id || bulkBusy}
                  assignable={assignable}
                  onApprove={(role) => approve(u, role)}
                  onReject={() => {
                    setRejectTarget(u);
                    setRejectNote("");
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* === MEMBRES ACTIFS === */}
      <section>
        <SectionHeader
          title="Membres"
          count={members.length}
          accent="emerald"
        />
        {members.length === 0 ? (
          <EmptyState message="Aucun membre approuvé pour le moment." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {members.map((u) => (
              <MemberCard
                key={u.id}
                user={u}
                busy={busyId === u.id}
                assignable={assignable}
                canManage={
                  !u.isCurrentUser &&
                  canManageUser(currentUserRole, u.role)
                }
                onChangeRole={(role) => changeRole(u, role)}
                onDelete={u.isCurrentUser ? undefined : () => setDeleteTarget(u)}
                onEditLink={() => {
                  setEditLinkTarget(u);
                  setEditLinkValue(u.employee?.id ?? "");
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* === REFUSÉS === */}
      {rejected.length > 0 && (
        <section>
          <SectionHeader
            title="Demandes refusées"
            count={rejected.length}
            accent="zinc"
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {rejected.map((u) => (
              <RejectedCard
                key={u.id}
                user={u}
                onDelete={() => setDeleteTarget(u)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Confirmation suppression définitive */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={
          deleteTarget
            ? `Supprimer le compte de ${deleteTarget.name} ?`
            : "Supprimer ?"
        }
        description={
          deleteTarget?.employee
            ? `Cette action supprimera définitivement le compte (${deleteTarget.email}). La fiche planning de ${deleteTarget.employee.firstName} reste, mais elle sera délinkée — la personne pourra se réinscrire et tu pourras la relier à nouveau.`
            : "Cette action supprimera définitivement le compte et toutes ses conversations. La personne pourra se réinscrire avec le même email."
        }
        confirmLabel="Supprimer définitivement"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget) await deleteUser(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Modification du lien collaborateur d'un membre approuvé */}
      <Dialog
        open={!!editLinkTarget}
        onOpenChange={(o) => !o && setEditLinkTarget(null)}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editLinkTarget?.employee
                ? `Modifier le rattachement de ${editLinkTarget?.name}`
                : `Rattacher ${editLinkTarget?.name ?? ""} à un collaborateur`}
            </DialogTitle>
            <DialogDescription>
              Choisis la fiche planning à associer à ce compte. Tu peux aussi
              le détacher en sélectionnant « Aucun ».
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            {/* On exclut le collaborateur déjà lié à CE user du flag "taken"
                pour qu'il reste sélectionnable (sinon on ne pourrait plus
                "Enregistrer" sans changement). Les fiches liées à un AUTRE
                compte restent grisées. */}
            <EmployeeSelect
              employees={employees.map((e) =>
                editLinkTarget && e.linkedUserId === editLinkTarget.id
                  ? { ...e, linkedUserId: null }
                  : e
              )}
              value={editLinkValue}
              onChange={setEditLinkValue}
              disabled={!!busyId}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditLinkTarget(null)}
              disabled={!!busyId}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-[13px] font-medium text-foreground/85 transition-colors hover:bg-muted/40 disabled:opacity-60"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() =>
                editLinkTarget && updateEmployeeLink(editLinkTarget, editLinkValue)
              }
              disabled={
                !!busyId ||
                // Pas de changement → désactive Enregistrer (évite un appel
                // API inutile et rassure l'utilisateur que rien ne va bouger).
                editLinkValue === (editLinkTarget?.employee?.id ?? "")
              }
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-violet-600 px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {busyId === editLinkTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Enregistrer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation refus */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              Refuser la demande de {rejectTarget?.name} ?
            </DialogTitle>
            <DialogDescription>
              L&apos;utilisateur ne pourra pas se connecter. Vous pouvez ajouter
              un motif (optionnel).
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Motif (optionnel)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-[13px] font-medium text-foreground/85 transition-colors hover:bg-muted/40"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => rejectTarget && reject(rejectTarget, rejectNote)}
              className="inline-flex h-10 items-center justify-center rounded-full bg-red-600 px-4 text-[13px] font-medium text-white transition-colors hover:bg-red-700"
            >
              Refuser
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Sous-composants ──────────────────────────────────────────── */

function SectionHeader({
  title,
  count,
  accent,
  description,
}: {
  title: string;
  count: number;
  accent: "amber" | "emerald" | "zinc";
  description?: string;
}) {
  const dotClass = {
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    zinc: "bg-zinc-400",
  }[accent];

  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn("h-2 w-2 rounded-full", dotClass)}
        />
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/70">
          {count}
        </span>
      </div>
      {description && (
        <p className="hidden max-w-md text-xs text-muted-foreground sm:block">
          {description}
        </p>
      )}
    </div>
  );
}

function PendingCard({
  user,
  employees,
  selected,
  onToggleSelect,
  selectedEmployeeId,
  onSelectEmployee,
  busy,
  assignable,
  onApprove,
  onReject,
}: {
  user: UserRow;
  employees: EmployeeOption[];
  selected: boolean;
  onToggleSelect: () => void;
  selectedEmployeeId: string;
  onSelectEmployee: (employeeId: string) => void;
  busy: boolean;
  assignable: AppRole[];
  onApprove: (role: AppRole) => void;
  onReject: () => void;
}) {
  // Rôle par défaut proposé à l'approbation : Collaborateur si disponible.
  const [role, setRole] = useState<AppRole>(
    assignable.includes("COLLABORATEUR") ? "COLLABORATEUR" : assignable[0]
  );
  return (
    <li
      className={cn(
        "hover-lift rounded-2xl border bg-card p-5 shadow-sm transition-colors",
        selected ? "border-violet-300 ring-1 ring-violet-200" : "border-border/80"
      )}
    >
      <div className="flex flex-col gap-5">
        {/* Identité du demandeur */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Sélectionner la demande de ${user.name}`}
            className="mt-1.5 h-4 w-4 shrink-0 accent-violet-600"
          />
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <p className="font-medium tracking-tight text-foreground">
              {user.name}
            </p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {user.email}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Demande envoyée {formatDate(user.createdAt)}
            </p>
          </div>
        </div>

        {/* Sélecteur de collaborateur à associer */}
        <EmployeeSelect
          employees={employees}
          value={selectedEmployeeId}
          onChange={onSelectEmployee}
          disabled={busy}
        />

        {/* Actions : choix du rôle + approuver / refuser */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-xl bg-muted/40 px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
            <ShieldCheck className="h-3.5 w-3.5" />
            Rôle
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              disabled={busy}
              className="bg-transparent text-[13px] font-medium text-foreground outline-none"
            >
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(role)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 px-3.5 text-[13px] font-medium text-white shadow-sm shadow-violet-600/20 transition-all hover:shadow-md hover:shadow-violet-600/30 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Approuver
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-medium text-foreground/85 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Refuser
          </button>
        </div>
      </div>
    </li>
  );
}

/** Sélecteur de collaborateur du planning à associer au compte. */
function EmployeeSelect({
  employees,
  value,
  onChange,
  disabled,
}: {
  employees: EmployeeOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex flex-col gap-1.5 rounded-xl bg-muted/40 px-3.5 py-2.5 ring-1 ring-inset ring-border",
        disabled && "opacity-60"
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Link2 className="h-3 w-3" />
        Collaborateur du planning à associer
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-transparent text-[14px] text-foreground outline-none"
      >
        <option value="">— Aucun (à lier plus tard) —</option>
        {employees.map((e) => {
          const taken = e.linkedUserId !== null;
          return (
            <option key={e.id} value={e.id} disabled={taken}>
              {e.firstName} {e.lastName !== "—" ? e.lastName : ""} ·{" "}
              {STATUS_LABELS[e.status]}
              {taken ? "  (déjà lié)" : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}

/**
 * Valeur du <select> de rôle : le rôle courant normalisé s'il fait partie des
 * rôles attribuables, sinon le premier attribuable (repli défensif).
 */
function roleValueForSelect(role: UserRole, assignable: AppRole[]): AppRole {
  const normalized: AppRole =
    role === "ADMIN"
      ? "ADMIN"
      : role === "MANAGEUR"
        ? "MANAGEUR"
        : "COLLABORATEUR";
  return assignable.includes(normalized) ? normalized : assignable[0];
}

function MemberCard({
  user,
  busy,
  assignable,
  canManage,
  onChangeRole,
  onDelete,
  onEditLink,
}: {
  user: UserRow;
  busy?: boolean;
  assignable: AppRole[];
  /** L'acteur a-t-il le droit de changer le rôle de ce membre ? */
  canManage?: boolean;
  onChangeRole?: (role: AppRole) => void;
  onDelete?: () => void;
  /** Ouvre la dialog de rattachement / modification du lien collaborateur. */
  onEditLink?: () => void;
}) {
  const creator = isCreator(user.role);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={user} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {user.name}
              {user.isCurrentUser && (
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground/70">
                  (vous)
                </span>
              )}
            </p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Le rôle est modifiable (select) si l'acteur peut gérer ce membre ;
              sinon badge en lecture seule. Le créateur est toujours en lecture. */}
          {canManage && onChangeRole && !creator ? (
            <label className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/85 ring-1 ring-inset ring-border">
              <ShieldCheck className="h-3 w-3" />
              <select
                value={roleValueForSelect(user.role, assignable)}
                onChange={(e) => onChangeRole(e.target.value as AppRole)}
                disabled={busy}
                aria-label={`Rôle de ${user.name}`}
                className="bg-transparent text-[11px] font-medium text-foreground outline-none"
              >
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                creator
                  ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100"
                  : user.role === "ADMIN"
                    ? "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100"
                    : "bg-muted text-foreground/85"
              )}
            >
              {creator ? (
                <Crown className="h-3 w-3" />
              ) : user.role === "COLLABORATEUR" || user.role === "EMPLOYEE" ? (
                <UserIcon className="h-3 w-3" />
              ) : (
                <ShieldCheck className="h-3 w-3" />
              )}
              {roleLabel(user.role)}
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Supprimer ce compte"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Supprimer le compte (libère la liaison collaborateur)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {user.employee ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="shrink-0">Lié à&nbsp;</span>
            <span className="truncate font-medium text-foreground/85">
              {user.employee.firstName}
              {user.employee.lastName !== "—" && ` ${user.employee.lastName}`}
            </span>
            <span className="shrink-0 text-muted-foreground/70">
              · {STATUS_LABELS[user.employee.status]}
            </span>
          </div>
        ) : (
          <div className="text-[12px] italic text-muted-foreground/70">
            Non rattaché au planning
          </div>
        )}
        {onEditLink && (
          <button
            type="button"
            onClick={onEditLink}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-50"
            title={
              user.employee
                ? "Changer ou retirer le rattachement à un collaborateur"
                : "Rattacher ce compte à un collaborateur du planning"
            }
          >
            <Pencil className="h-3 w-3" />
            {user.employee ? "Modifier" : "Lier"}
          </button>
        )}
      </div>
    </li>
  );
}

function RejectedCard({
  user,
  onDelete,
}: {
  user: UserRow;
  onDelete?: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-muted/40 p-4">
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground/85">{user.name}</p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        {user.rejectionNote && (
          <p className="mt-1 text-xs italic text-muted-foreground">
            « {user.rejectionNote} »
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-100">
          <X className="h-3 w-3" />
          Refusé
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Supprimer ce compte"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Supprimer définitivement (libère l'email pour réinscription)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-7">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40 text-muted-foreground/70">
          <Check className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function Avatar({ user }: { user: UserRow }) {
  // Prénom : on privilégie la fiche Employee si liée (déjà séparé), sinon
  // dernier mot du `name` (convention "Nom Prénom" du seed admin).
  const fallbackName = user.name.trim();
  const fallbackParts = fallbackName.split(/\s+/);
  const fallbackFirstName = fallbackParts[0] ?? fallbackName;
  const firstName = user.employee?.firstName ?? fallbackFirstName;
  const color = user.employee?.displayColor ?? null;
  return (
    <AvatarImage
      avatarId={user.avatarId}
      firstName={firstName}
      color={color}
      size={40}
    />
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const code = data?.error as string | undefined;
    return mapErrorCode(code);
  } catch {
    return "Erreur inattendue";
  }
}

function mapErrorCode(code?: string): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "Vous devez être connecté.";
    case "FORBIDDEN":
      return "Action réservée aux administrateurs.";
    case "ALREADY_REVIEWED":
      return "Cette demande a déjà été traitée.";
    case "NOT_FOUND":
      return "Utilisateur introuvable.";
    case "ROLE_REQUIRED":
      return "Le rôle est requis pour approuver.";
    case "EMPLOYEE_NOT_FOUND":
      return "Collaborateur introuvable dans votre pharmacie.";
    case "EMPLOYEE_TAKEN":
      return "Ce collaborateur est déjà rattaché à un autre compte.";
    case "ROLE_FORBIDDEN":
      return "Vous n'avez pas le droit d'attribuer ce rôle.";
    case "CANNOT_MANAGE_CREATOR":
      return "Le créateur de l'officine ne peut pas être modifié.";
    case "CANNOT_CHANGE_OWN_ROLE":
      return "Vous ne pouvez pas changer votre propre rôle.";
    case "CANNOT_DELETE_CREATOR":
      return "Le créateur de l'officine ne peut pas être supprimé.";
    default:
      return "Erreur inattendue. Réessayez.";
  }
}
