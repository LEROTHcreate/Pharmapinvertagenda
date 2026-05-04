"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Crown,
  Link2,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { EmployeeStatus } from "@prisma/client";
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
  role: "ADMIN" | "EMPLOYEE";
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
}: {
  users: UserRow[];
  employees: EmployeeOption[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Collaborateur sélectionné pour chaque demande en attente (clé: userId, valeur: employeeId ou "")
  const [selectedEmployee, setSelectedEmployee] = useState<
    Record<string, string>
  >({});

  // Confirmation de refus avec motif optionnel.
  const [rejectTarget, setRejectTarget] = useState<UserRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Confirmation de suppression définitive
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

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

  async function approve(user: UserRow, role: "ADMIN" | "EMPLOYEE") {
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

  return (
    <div className="space-y-8">
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
          <ul className="space-y-3">
            {pending.map((u) => (
              <PendingCard
                key={u.id}
                user={u}
                employees={employees}
                selectedEmployeeId={selectedEmployee[u.id] ?? ""}
                onSelectEmployee={(empId) =>
                  setSelectedEmployee((prev) => ({ ...prev, [u.id]: empId }))
                }
                busy={busyId === u.id}
                onApproveAdmin={() => approve(u, "ADMIN")}
                onApproveEmployee={() => approve(u, "EMPLOYEE")}
                onReject={() => {
                  setRejectTarget(u);
                  setRejectNote("");
                }}
              />
            ))}
          </ul>
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
                onDelete={u.isCurrentUser ? undefined : () => setDeleteTarget(u)}
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
  selectedEmployeeId,
  onSelectEmployee,
  busy,
  onApproveAdmin,
  onApproveEmployee,
  onReject,
}: {
  user: UserRow;
  employees: EmployeeOption[];
  selectedEmployeeId: string;
  onSelectEmployee: (employeeId: string) => void;
  busy: boolean;
  onApproveAdmin: () => void;
  onApproveEmployee: () => void;
  onReject: () => void;
}) {
  return (
    <li className="hover-lift rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5">
        {/* Identité du demandeur */}
        <div className="flex items-start gap-3">
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

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <ApproveButton
            disabled={busy}
            onClick={onApproveAdmin}
            icon={<Crown className="h-4 w-4" />}
            label="Approuver comme administrateur"
            sub="Peut gérer le planning"
            tone="violet"
          />
          <ApproveButton
            disabled={busy}
            onClick={onApproveEmployee}
            icon={<UserIcon className="h-4 w-4" />}
            label="Approuver comme collaborateur"
            sub="Lecture + demandes"
            tone="emerald"
          />
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

function ApproveButton({
  onClick,
  disabled,
  icon,
  label,
  sub,
  tone,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string;
  tone: "violet" | "emerald";
}) {
  const styles = {
    violet:
      "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-600/20 hover:shadow-md hover:shadow-violet-600/30",
    emerald:
      "bg-card text-foreground/90 ring-1 ring-inset ring-border hover:ring-emerald-300 hover:bg-emerald-50",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group inline-flex flex-col items-start gap-0 rounded-xl px-3.5 py-2 text-left transition-all duration-200 disabled:opacity-60",
        styles
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "text-[11px] tracking-tight",
          tone === "violet" ? "text-white/75" : "text-muted-foreground"
        )}
      >
        {sub}
      </span>
    </button>
  );
}

function MemberCard({
  user,
  onDelete,
}: {
  user: UserRow;
  onDelete?: () => void;
}) {
  const isAdmin = user.role === "ADMIN";
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
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
              isAdmin
                ? "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100"
                : "bg-muted text-foreground/85"
            )}
          >
            {isAdmin ? (
              <>
                <ShieldCheck className="h-3 w-3" />
                Administrateur
              </>
            ) : (
              <>
                <UserIcon className="h-3 w-3" />
                Collaborateur
              </>
            )}
          </span>
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

      {user.employee ? (
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Link2 className="h-3 w-3" />
          Lié à&nbsp;
          <span className="font-medium text-foreground/85">
            {user.employee.firstName}
            {user.employee.lastName !== "—" && ` ${user.employee.lastName}`}
          </span>
          <span className="text-muted-foreground/70">
            · {STATUS_LABELS[user.employee.status]}
          </span>
        </div>
      ) : (
        <div className="text-[12px] italic text-muted-foreground/70">
          Non rattaché au planning
        </div>
      )}
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
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10">
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
  const fallbackFirstName = fallbackParts[fallbackParts.length - 1] ?? fallbackName;
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
    default:
      return "Erreur inattendue. Réessayez.";
  }
}
