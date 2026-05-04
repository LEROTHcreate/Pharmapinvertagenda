"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
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
import { ABSENCE_LABELS } from "@/types";
import { ABSENCE_CODES } from "@/validators/absence";
import type { AbsenceCode } from "@prisma/client";

type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /**
   * Active le mode admin (saisie manuelle pour un autre collaborateur,
   * validation directe sans étape PENDING). En mode collaborateur, on cache
   * le picker employé et le toggle auto-validation.
   */
  isAdmin?: boolean;
};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function AbsenceRequestForm({
  open,
  onClose,
  onCreated,
  isAdmin = false,
}: Props) {
  const [dateStart, setDateStart] = useState(todayIso());
  const [dateEnd, setDateEnd] = useState(todayIso());
  const [absenceCode, setAbsenceCode] = useState<AbsenceCode>("CONGE");
  const allowedCodes = ABSENCE_CODES;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Mode admin : sélection du collaborateur cible + auto-validation ──
  // En mode admin :
  //   targetEmployeeId = "" → pour soi-même (mode demande classique)
  //   autoApprove = true (par défaut admin) → l'absence est appliquée direct
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>("");
  const [autoApprove, setAutoApprove] = useState<boolean>(true);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  // Quand le dialog s'ouvre en mode admin, on charge la liste des collaborateurs
  useEffect(() => {
    if (!open || !isAdmin) return;
    setEmployeesLoading(true);
    fetch("/api/employees")
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((data: { employees?: EmployeeOption[] }) => {
        setEmployees(data.employees ?? []);
      })
      .finally(() => setEmployeesLoading(false));
  }, [open, isAdmin]);

  async function handleSubmit() {
    if (dateStart > dateEnd) {
      setError("La date de début doit être avant la date de fin");
      return;
    }
    if (isAdmin && autoApprove && !targetEmployeeId) {
      setError(
        "Validation directe : sélectionne d'abord le collaborateur concerné."
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/absences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dateStart,
          dateEnd,
          absenceCode,
          reason: reason.trim() || undefined,
          // En mode admin uniquement, on transmet le ciblage + auto-validation
          ...(isAdmin && targetEmployeeId
            ? { targetEmployeeId }
            : {}),
          ...(isAdmin && autoApprove ? { autoApprove: true } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erreur lors de l'envoi");
        return;
      }
      onCreated();
      onClose();
      // Réinit pour la prochaine ouverture
      setDateStart(todayIso());
      setDateEnd(todayIso());
      setAbsenceCode("CONGE");
      setReason("");
      setTargetEmployeeId("");
      setAutoApprove(true);
    } finally {
      setBusy(false);
    }
  }

  const titleText =
    isAdmin && autoApprove
      ? "Saisie d'une absence"
      : "Nouvelle demande d'absence";
  const descriptionText =
    isAdmin && autoApprove
      ? "Saisie directe en tant qu'admin : l'absence est appliquée immédiatement sur le planning du collaborateur sélectionné."
      : "Votre demande sera transmise à l'admin pour validation. Une fois approuvée, vos créneaux planning sur la période seront marqués automatiquement.";

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          {/* ─── Mode admin : choix du collaborateur cible ──────────── */}
          {isAdmin && (
            <div className="space-y-1.5">
              <Label htmlFor="abs-target">Collaborateur</Label>
              <Select
                value={targetEmployeeId}
                onValueChange={(v) => setTargetEmployeeId(v)}
                disabled={employeesLoading}
              >
                <SelectTrigger id="abs-target">
                  <SelectValue
                    placeholder={
                      employeesLoading
                        ? "Chargement…"
                        : "— Choisir un collaborateur —"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName}
                      {e.lastName && e.lastName !== "—" ? ` ${e.lastName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="abs-type">Type</Label>
            <Select
              value={absenceCode}
              onValueChange={(v) => setAbsenceCode(v as AbsenceCode)}
            >
              <SelectTrigger id="abs-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedCodes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ABSENCE_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="abs-start">Du</Label>
              <Input
                id="abs-start"
                type="date"
                value={dateStart}
                min={todayIso()}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="abs-end">Au</Label>
              <Input
                id="abs-end"
                type="date"
                value={dateEnd}
                min={dateStart}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="abs-reason">Motif (optionnel)</Label>
            <textarea
              id="abs-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ex: vacances en famille, rdv médical…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-500 resize-none"
            />
          </div>

          {/* ─── Mode admin : toggle "validation directe" ───────────── */}
          {isAdmin && (
            <label
              htmlFor="abs-auto"
              className="flex items-start gap-2.5 rounded-md border border-violet-200 bg-violet-50/50 dark:border-violet-900/40 dark:bg-violet-950/30 px-3 py-2.5 cursor-pointer select-none"
            >
              <input
                id="abs-auto"
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-violet-600"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-violet-900">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Validation directe (admin)
                </p>
                <p className="text-[11.5px] text-violet-700/80 leading-snug mt-0.5">
                  L'absence est appliquée immédiatement sur le planning, sans
                  passer par la file d'attente. Décochez pour soumettre comme
                  une demande classique.
                </p>
              </div>
            </label>
          )}

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isAdmin && autoApprove ? "Appliquer l'absence" : "Envoyer la demande"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
