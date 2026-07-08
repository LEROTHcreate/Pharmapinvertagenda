"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updatePayrollSettings } from "@/app/(dashboard)/parametres/actions";
import { DEFAULT_PAYROLL_RATES } from "@/lib/payroll-calc";
import { REGION_LABELS, type Region } from "@/lib/payroll-reference";

type Initial = {
  region: Region;
  /** Taux salarial en POURCENTAGE (ex: 22), null = défaut moteur. */
  contribEmployeePct: number | null;
  /** Taux patronal en POURCENTAGE (ex: 42), null = défaut moteur. */
  contribEmployerPct: number | null;
  /** Budget annuel de masse salariale (coût employeur total, €), null = non défini. */
  annualBudget: number | null;
};

const REGIONS: Region[] = [
  "NATIONAL",
  "IDF",
  "GRANDE_METROPOLE",
  "PROVINCE",
  "RURAL",
];

const DEFAULT_EMPLOYEE_PCT = Math.round(
  DEFAULT_PAYROLL_RATES.socialContributionsEmployee * 100
);
const DEFAULT_EMPLOYER_PCT = Math.round(
  DEFAULT_PAYROLL_RATES.socialContributionsEmployer * 100
);

/**
 * Réglages Rémunération de l'officine — région de référence (benchmark) et
 * taux de cotisations. Visible uniquement pour les admins autorisés au module
 * Rémunération (la page parente gère cette condition).
 */
export function PayrollSettingsForm({ initial }: { initial: Initial }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [region, setRegion] = useState<Region>(initial.region);
  const [emp, setEmp] = useState<string>(
    initial.contribEmployeePct != null ? String(initial.contribEmployeePct) : ""
  );
  const [empr, setEmpr] = useState<string>(
    initial.contribEmployerPct != null ? String(initial.contribEmployerPct) : ""
  );
  const [budget, setBudget] = useState<string>(
    initial.annualBudget != null ? String(initial.annualBudget) : ""
  );
  const [error, setError] = useState<string | null>(null);

  function parsePct(raw: string): number | null | "invalid" {
    const t = raw.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    if (Number.isNaN(n) || n < 0 || n > 100) return "invalid";
    return n;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const empVal = parsePct(emp);
    const emprVal = parsePct(empr);
    if (empVal === "invalid" || emprVal === "invalid") {
      setError("Les taux doivent être des pourcentages entre 0 et 100.");
      return;
    }
    // Budget : nombre ≥ 0 (on retire espaces / séparateurs de milliers), ou null.
    const budgetRaw = budget.replace(/[\s ]/g, "").replace(",", ".");
    let budgetVal: number | null = null;
    if (budgetRaw !== "") {
      const n = Number(budgetRaw);
      if (Number.isNaN(n) || n < 0) {
        setError("Le budget annuel doit être un montant positif.");
        return;
      }
      budgetVal = n;
    }
    startTransition(async () => {
      const res = await updatePayrollSettings({
        payrollRegion: region,
        // Pourcentage → fraction (22 → 0.22). Null = défaut moteur.
        payrollContribEmployee: empVal === null ? null : empVal / 100,
        payrollContribEmployer: emprVal === null ? null : emprVal / 100,
        payrollAnnualBudget: budgetVal,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast({
        tone: "success",
        title: "Réglages rémunération enregistrés",
        description: "Appliqués au prochain calcul de paie.",
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-5"
    >
      <div>
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
          Rémunération
        </h2>
        <p className="text-[12px] text-zinc-500 mb-4">
          Région de référence pour le benchmark et taux de cotisations utilisés
          dans les estimations de paie.
        </p>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="payrollRegion">Région (benchmark marché)</Label>
            <select
              id="payrollRegion"
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
              disabled={isPending}
              className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="text-[11.5px] text-zinc-500 leading-relaxed">
              Ajuste les salaires moyens de comparaison (Île-de-France ≈ +12 %).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="contribEmployee">Cotisations salariales (%)</Label>
              <Input
                id="contribEmployee"
                inputMode="decimal"
                value={emp}
                onChange={(e) => setEmp(e.target.value)}
                disabled={isPending}
                placeholder={`${DEFAULT_EMPLOYEE_PCT} (défaut)`}
                className="max-w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contribEmployer">Cotisations patronales (%)</Label>
              <Input
                id="contribEmployer"
                inputMode="decimal"
                value={empr}
                onChange={(e) => setEmpr(e.target.value)}
                disabled={isPending}
                placeholder={`${DEFAULT_EMPLOYER_PCT} (défaut)`}
                className="max-w-[160px]"
              />
            </div>
          </div>
          <p className="text-[11.5px] text-zinc-500 leading-relaxed">
            Laisser vide pour utiliser les taux moyens par défaut
            ({DEFAULT_EMPLOYEE_PCT} % / {DEFAULT_EMPLOYER_PCT} %). Ce sont des
            estimations — les taux exacts dépendent du statut et de la convention.
          </p>

          <div className="space-y-1.5 border-t border-border/60 pt-3.5">
            <Label htmlFor="annualBudget">
              Budget annuel de masse salariale (€)
            </Label>
            <Input
              id="annualBudget"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              disabled={isPending}
              placeholder="Ex : 720000"
              className="max-w-[200px]"
            />
            <p className="text-[11.5px] text-zinc-500 leading-relaxed">
              Coût employeur total visé sur l&apos;année. Sert au prévisionnel de
              la page Rémunération (projection au rythme du mois vs budget +
              alerte de dérive). Laisser vide si pas de budget.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
