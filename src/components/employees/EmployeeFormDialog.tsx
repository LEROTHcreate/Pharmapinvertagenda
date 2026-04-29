"use client";

import * as React from "react";
import type { EmployeeStatus } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS } from "@/types";
import { EMPLOYEE_STATUSES, employeeInput } from "@/validators/employee";
import {
  createEmployee,
  updateEmployee,
} from "@/app/(dashboard)/employes/actions";
import type { EmployeeRowData } from "@/components/employees/EmployeesTable";
import { ROLE_PALETTE, pickRoleColor } from "@/lib/role-colors";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  employee: EmployeeRowData | null;
  onClose: () => void;
};

type FormState = {
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  weeklyHours: string;
  displayColor: string;
  displayOrder: string;
  hireDate: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  status: "PREPARATEUR",
  weeklyHours: "35",
  displayColor: pickRoleColor("PREPARATEUR", 0),
  displayOrder: "0",
  hireDate: "",
  isActive: true,
};

function fromEmployee(e: EmployeeRowData): FormState {
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    status: e.status,
    weeklyHours: String(e.weeklyHours),
    displayColor: e.displayColor,
    displayOrder: String(e.displayOrder),
    hireDate: e.hireDate ?? "",
    isActive: e.isActive,
  };
}

export function EmployeeFormDialog({ open, mode, employee, onClose }: Props) {
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(mode === "edit" && employee ? fromEmployee(employee) : emptyForm);
  }, [open, mode, employee]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Quand on change de statut, on suggère automatiquement la 1re couleur
   * de la palette du nouveau rôle SI la couleur courante n'appartient
   * pas déjà à cette palette (l'utilisateur garde la main s'il a choisi
   * une nuance précise).
   */
  const setStatus = (status: EmployeeStatus) => {
    setForm((prev) => {
      const palette = ROLE_PALETTE[status];
      const inPalette = palette.includes(prev.displayColor.toLowerCase()) ||
        palette.includes(prev.displayColor);
      return {
        ...prev,
        status,
        displayColor: inPalette ? prev.displayColor : palette[0],
      };
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      status: form.status,
      weeklyHours: Number(form.weeklyHours),
      displayColor: form.displayColor,
      displayOrder: Number.parseInt(form.displayOrder, 10) || 0,
      hireDate: form.hireDate || null,
      isActive: form.isActive,
    };

    const parsed = employeeInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Données invalides");
      return;
    }

    startTransition(async () => {
      const res =
        mode === "edit" && employee
          ? await updateEmployee(employee.id, parsed.data)
          : await createEmployee(parsed.data);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Modifier le collaborateur" : "Nouveau collaborateur"}
          </DialogTitle>
          <DialogDescription>
            Renseignez les informations métier. La compatibilité rôle / poste
            est appliquée automatiquement dans le planning.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                required
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                required
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="status">Statut</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setStatus(v as EmployeeStatus)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weeklyHours">Heures hebdo</Label>
              <Input
                id="weeklyHours"
                type="number"
                min={0}
                max={80}
                step={0.5}
                required
                value={form.weeklyHours}
                onChange={(e) => set("weeklyHours", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="displayColor">
                Couleur d&apos;affichage
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  · palette {STATUS_LABELS[form.status]}
                </span>
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {ROLE_PALETTE[form.status].map((c) => {
                  const active =
                    form.displayColor.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("displayColor", c)}
                      aria-label={`Choisir ${c}`}
                      aria-pressed={active}
                      className={cn(
                        "relative h-9 w-9 rounded-full transition-all duration-150 hover:scale-110",
                        active
                          ? "ring-2 ring-offset-2 ring-zinc-900"
                          : "ring-1 ring-inset ring-black/10"
                      )}
                      style={{ backgroundColor: c }}
                    >
                      {active && (
                        <Check
                          className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow"
                          strokeWidth={3}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Une nuance distincte est attribuée à chaque collaborateur du même rôle.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayOrder">Ordre d&apos;affichage</Label>
              <Input
                id="displayOrder"
                type="number"
                min={0}
                step={1}
                value={form.displayOrder}
                onChange={(e) => set("displayOrder", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hireDate">Date d&apos;embauche</Label>
              <Input
                id="hireDate"
                type="date"
                value={form.hireDate}
                onChange={(e) => set("hireDate", e.target.value)}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={form.isActive}
                  onChange={(e) => set("isActive", e.target.checked)}
                />
                Collaborateur actif
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Enregistrement…"
                : mode === "edit"
                  ? "Enregistrer"
                  : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
