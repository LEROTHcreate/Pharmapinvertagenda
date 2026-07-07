"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  ContractType,
  EmployeeStatus,
  OvertimeReference,
  UserRole,
} from "@prisma/client";
import {
  assignableRoles,
  canManageUser,
  isCreator,
  normalizeRole,
  roleLabel,
  type AppRole,
} from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABELS } from "@/types";

const CONTRACT_SHORT: Record<ContractType, string> = {
  CDI: "CDI",
  CDD: "CDD",
  APPRENTISSAGE: "Apprentissage",
  STAGE: "Stage",
  INTERIM: "Intérim",
};

/** "2026-07-31" → "31/07/2026" (affichage FR). */
function frDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
import { EmployeeFormDialog } from "@/components/employees/EmployeeFormDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  deleteEmployee,
  toggleEmployeeActive,
} from "@/app/(dashboard)/employes/actions";

export type EmployeeRowData = {
  id: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: number;
  overtimeReference: OvertimeReference;
  displayColor: string;
  displayOrder: number;
  isActive: boolean;
  hireDate: string | null;
  // Échéances RH (toutes optionnelles, format ISO YYYY-MM-DD)
  contractType: ContractType;
  contractEndDate: string | null;
  trialEndDate: string | null;
  departureDate: string | null;
  lastMedicalVisitDate: string | null;
  lastProfessionalInterviewDate: string | null;
  dpcLastDate: string | null;
};

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; employee: EmployeeRowData }
  | null;

/** Compte utilisateur relié à une fiche employé (pour le choix du rôle). */
export type RoleInfo = {
  userId: string;
  role: UserRole;
  isCurrentUser: boolean;
};

export function EmployeesTable({
  employees,
  roleByEmployeeId,
  currentUserRole,
}: {
  employees: EmployeeRowData[];
  /** Rôle du compte relié à chaque employé (clé = employeeId). */
  roleByEmployeeId?: Record<string, RoleInfo>;
  /** Rôle de l'utilisateur courant — détermine ce qu'il peut attribuer. */
  currentUserRole?: UserRole;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [deleteTarget, setDeleteTarget] =
    React.useState<EmployeeRowData | null>(null);
  // Rôles que l'utilisateur courant a le droit d'attribuer (jamais CREATEUR).
  const assignable = React.useMemo(
    () => assignableRoles(currentUserRole ?? null),
    [currentUserRole]
  );
  const [roleBusyUserId, setRoleBusyUserId] = React.useState<string | null>(
    null
  );

  const changeRole = async (userId: string, role: AppRole) => {
    setRoleBusyUserId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error === "CANNOT_CHANGE_OWN_ROLE"
            ? "Vous ne pouvez pas changer votre propre rôle."
            : "Changement de rôle impossible."
        );
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Erreur réseau lors du changement de rôle.");
    } finally {
      setRoleBusyUserId(null);
    }
  };

  // Numéro d'ordre affiché = RANG parmi les ACTIFS uniquement (contigu, sans
  // trou). Un inactif n'a pas de numéro. La liste arrive déjà triée (actifs par
  // displayOrder, puis inactifs).
  const activeRankById = React.useMemo(() => {
    const map = new Map<string, number>();
    let rank = 0;
    for (const e of employees) {
      if (e.isActive) map.set(e.id, rank++);
    }
    return map;
  }, [employees]);

  const handleToggle = (e: EmployeeRowData) => {
    setPendingId(e.id);
    setError(null);
    startTransition(async () => {
      const res = await toggleEmployeeActive(e.id, !e.isActive);
      if (!res.ok) setError(res.error);
      setPendingId(null);
    });
  };

  const handleDelete = (e: EmployeeRowData) => {
    setDeleteTarget(e);
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setPendingId(target.id);
    setError(null);
    const res = await deleteEmployee(target.id);
    if (!res.ok) setError(res.error);
    setPendingId(null);
    setDeleteTarget(null);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus />
          Nouveau collaborateur
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-1 px-3 py-2"></th>
              <th className="px-3 py-2 text-left font-medium">Nom</th>
              <th className="px-3 py-2 text-left font-medium">Statut</th>
              <th className="px-3 py-2 text-left font-medium">Rôle</th>
              <th className="px-3 py-2 text-right font-medium">Hebdo</th>
              <th className="px-3 py-2 text-right font-medium">Ordre</th>
              <th className="px-3 py-2 text-left font-medium">État</th>
              <th className="w-1 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Aucun collaborateur. Cliquez sur « Nouveau collaborateur » pour commencer.
                </td>
              </tr>
            )}
            {employees.map((e) => {
              const isRowPending = pendingId === e.id && isPending;
              return (
                <tr
                  key={e.id}
                  className={
                    e.isActive
                      ? "hover:bg-muted/40"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/40"
                  }
                >
                  <td className="px-3 py-2">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: e.displayColor }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {e.lastName.toUpperCase()} {e.firstName}
                    </div>
                    {(e.contractType !== "CDI" || e.departureDate) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {e.contractType !== "CDI" && (
                          <span>
                            {CONTRACT_SHORT[e.contractType]}
                            {e.contractEndDate
                              ? ` → ${frDate(e.contractEndDate)}`
                              : ""}
                          </span>
                        )}
                        {e.departureDate && (
                          <span className="text-amber-700 dark:text-amber-400">
                            Départ {frDate(e.departureDate)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{STATUS_LABELS[e.status]}</td>
                  <td className="px-3 py-2">
                    <RoleCell
                      info={roleByEmployeeId?.[e.id]}
                      assignable={assignable}
                      currentUserRole={currentUserRole}
                      busy={roleBusyUserId === roleByEmployeeId?.[e.id]?.userId}
                      onChange={(role) =>
                        roleByEmployeeId?.[e.id] &&
                        changeRole(roleByEmployeeId[e.id].userId, role)
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.weeklyHours} h
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.isActive ? activeRankById.get(e.id) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {e.isActive ? (
                      <Badge variant="success">Actif</Badge>
                    ) : (
                      <Badge variant="secondary">Inactif</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Actions"
                          disabled={isRowPending}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => setDialog({ mode: "edit", employee: e })}
                        >
                          <Pencil className="h-4 w-4" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleToggle(e)}>
                          <Power className="h-4 w-4" />
                          {e.isActive ? "Désactiver" : "Réactiver"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => handleDelete(e)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EmployeeFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        employee={dialog?.mode === "edit" ? dialog.employee : null}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget
            ? `Supprimer ${deleteTarget.firstName} ${deleteTarget.lastName} ?`
            : "Supprimer ?"
        }
        description="Cette action supprimera aussi son planning et ses absences. Elle est irréversible."
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

/** Valeur du <select> de rôle : rôle courant normalisé s'il est attribuable,
 *  sinon le premier attribuable (repli défensif). */
function roleValueForSelect(role: UserRole, assignable: AppRole[]): AppRole {
  const normalized = normalizeRole(role);
  const candidate: AppRole =
    normalized === "CREATEUR" ? "ADMIN" : normalized;
  return assignable.includes(candidate) ? candidate : assignable[0];
}

/** Cellule « Rôle » : select éditable si l'acteur peut gérer ce compte,
 *  badge en lecture seule sinon (créateur, soi-même, ou droits insuffisants). */
function RoleCell({
  info,
  assignable,
  currentUserRole,
  busy,
  onChange,
}: {
  info?: RoleInfo;
  assignable: AppRole[];
  currentUserRole?: UserRole;
  busy: boolean;
  onChange: (role: AppRole) => void;
}) {
  if (!info) {
    return (
      <span className="text-xs italic text-muted-foreground/60">
        Aucun compte
      </span>
    );
  }
  const creator = isCreator(info.role);
  const editable =
    !creator &&
    !info.isCurrentUser &&
    !!currentUserRole &&
    canManageUser(currentUserRole, info.role) &&
    assignable.length > 0;

  if (editable) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1">
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <ShieldCheck className="h-3 w-3 text-muted-foreground" />
        )}
        <select
          value={roleValueForSelect(info.role, assignable)}
          onChange={(e) => onChange(e.target.value as AppRole)}
          disabled={busy}
          aria-label="Rôle du compte"
          className="bg-transparent text-xs font-medium text-foreground outline-none"
        >
          {assignable.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        creator
          ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
          : "bg-muted text-foreground/80"
      )}
      title={
        info.isCurrentUser
          ? "Vous ne pouvez pas changer votre propre rôle"
          : creator
            ? "Le créateur ne peut pas être modifié"
            : undefined
      }
    >
      {creator ? (
        <Crown className="h-3 w-3" />
      ) : (
        <ShieldCheck className="h-3 w-3" />
      )}
      {roleLabel(info.role)}
      {info.isCurrentUser && (
        <span className="opacity-60">(vous)</span>
      )}
    </span>
  );
}
