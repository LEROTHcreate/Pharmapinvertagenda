"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Plus, Power, Trash2 } from "lucide-react";
import type { EmployeeStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABELS } from "@/types";
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
  displayColor: string;
  displayOrder: number;
  isActive: boolean;
  hireDate: string | null;
};

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; employee: EmployeeRowData }
  | null;

export function EmployeesTable({
  employees,
}: {
  employees: EmployeeRowData[];
}) {
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [deleteTarget, setDeleteTarget] =
    React.useState<EmployeeRowData | null>(null);

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
                  colSpan={7}
                  className="px-3 py-12 text-center text-muted-foreground"
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
                  <td className="px-3 py-2 font-medium">
                    {e.lastName.toUpperCase()} {e.firstName}
                  </td>
                  <td className="px-3 py-2">{STATUS_LABELS[e.status]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.weeklyHours} h
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.displayOrder}
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
