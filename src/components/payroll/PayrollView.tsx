"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Loader2, Pencil, Save, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Line = {
  employeeId: string;
  employeeName: string;
  hourlyGrossRate: number | null;
  taskHoursRegular: number;
  overtimeHours25: number;
  overtimeHours50: number;
  paidLeaveHours: number;
  trainingHours: number;
  sickHoursEmployerPaid: number;
  sickHoursWaitingPeriod: number;
  sickHoursCpam: number;
  unpaidAbsenceHours: number;
  grossEmployer: number;
  socialContributionsEmployee: number;
  netEstimated: number;
  socialContributionsEmployer: number;
  totalEmployerCost: number;
};

type Totals = {
  grossEmployer: number;
  netEstimated: number;
  socialContributionsEmployer: number;
  totalEmployerCost: number;
};

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

export function PayrollView({ initialMonth }: { initialMonth: string }) {
  const { toast } = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);

  const fetchPayroll = useCallback(
    async (m: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/payroll?month=${m}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast({
            tone: "error",
            title: "Chargement impossible",
            description: data.error ?? "Erreur réseau",
          });
          return;
        }
        const data = await res.json();
        setLines(data.lines);
        setTotals(data.totals);
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    fetchPayroll(month);
  }, [month, fetchPayroll]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* En-tête */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-zinc-900">
            Rémunération
          </h1>
          <p className="text-[12.5px] text-zinc-500 mt-0.5 capitalize">
            {monthLabel(month)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
            <button
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-accent/60"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setMonth(
                  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
                );
              }}
              className="h-7 px-3 rounded-full text-[12px] font-medium text-foreground/80 hover:bg-accent/60"
            >
              Ce mois-ci
            </button>
            <button
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-foreground/70 hover:bg-accent/60"
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Avertissement légal */}
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 p-3 sm:p-4 flex items-start gap-3">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
        <div className="text-[12.5px] text-amber-900 leading-relaxed">
          <p className="font-medium">Estimation indicative — pas un bulletin de paie légal</p>
          <p className="mt-0.5">
            Les calculs ci-dessous suivent les règles publiques (carence maladie 3j, IJSS Sécu Sociale,
            heures sup +25%/+50%, cotisations moyennes). Pour la paie réelle, utilisez un logiciel
            agréé (Silae, Sage Paie…) ou un expert-comptable. Les taux de cotisations exacts dépendent
            du statut, de l'ancienneté, et de la <strong>Convention Collective Pharmacie d'Officine (IDCC 1996)</strong>.
          </p>
        </div>
      </div>

      {/* Récap totaux */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <TotalCard label="Brut total (employeur)" value={totals.grossEmployer} tone="zinc" />
          <TotalCard label="Net estimé total" value={totals.netEstimated} tone="emerald" />
          <TotalCard label="Charges patronales" value={totals.socialContributionsEmployer} tone="amber" />
          <TotalCard label="Coût total officine" value={totals.totalEmployerCost} tone="violet" big />
        </div>
      )}

      {/* Tableau des lignes */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : lines.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucun employé actif sur ce mois.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-zinc-50/60 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="text-left px-3 py-2.5">Employé</th>
                  <th className="text-right px-3 py-2.5">Taux €/h</th>
                  <th className="text-right px-3 py-2.5">H trav.</th>
                  <th className="text-right px-3 py-2.5">H sup</th>
                  <th className="text-right px-3 py-2.5">Congés</th>
                  <th className="text-right px-3 py-2.5">Maladie *</th>
                  <th className="text-right px-3 py-2.5">Brut</th>
                  <th className="text-right px-3 py-2.5">Net est.</th>
                  <th className="text-right px-3 py-2.5">Coût total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <PayrollRow
                    key={l.employeeId}
                    line={l}
                    onRateUpdated={() => fetchPayroll(month)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        * Maladie = heures payées par l'employeur après 3 jours de carence (sous condition d'ancienneté ≥ 1 an,
        Convention Pharmacie d'Officine). Les IJSS de la CPAM ne figurent pas dans le coût employeur.
      </p>
    </div>
  );
}

function TotalCard({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: number;
  tone: "zinc" | "emerald" | "amber" | "violet";
  big?: boolean;
}) {
  const toneCls: Record<string, string> = {
    zinc: "bg-zinc-50/60 text-zinc-900",
    emerald: "bg-emerald-50/60 text-emerald-900",
    amber: "bg-amber-50/60 text-amber-900",
    violet: "bg-violet-50/70 text-violet-900 ring-1 ring-violet-200/60",
  };
  return (
    <div className={cn("rounded-2xl px-4 py-3", toneCls[tone])}>
      <p className="text-[10.5px] uppercase tracking-wide font-semibold opacity-70">
        {label}
      </p>
      <p className={cn("font-mono tabular-nums font-semibold mt-1", big ? "text-xl" : "text-lg")}>
        {fmt(value)}
      </p>
    </div>
  );
}

function PayrollRow({
  line,
  onRateUpdated,
}: {
  line: Line;
  onRateUpdated: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    line.hourlyGrossRate != null ? String(line.hourlyGrossRate) : ""
  );
  const [busy, setBusy] = useState(false);

  async function saveRate() {
    const trimmed = draft.trim().replace(",", ".");
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (Number.isNaN(value) || value < 0 || value > 200)) {
      toast({
        tone: "error",
        title: "Taux invalide",
        description: "Saisis un nombre entre 0 et 200 €.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${line.employeeId}/hourly-rate`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hourlyGrossRate: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          tone: "error",
          title: "Sauvegarde impossible",
          description: data.error ?? "Erreur",
        });
        return;
      }
      setEditing(false);
      onRateUpdated();
    } finally {
      setBusy(false);
    }
  }

  const overtime = line.overtimeHours25 + line.overtimeHours50;

  return (
    <tr className="border-t border-border hover:bg-zinc-50/40 transition-colors">
      <td className="px-3 py-2 font-medium text-zinc-900">{line.employeeName}</td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="inline-flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="w-16 rounded border border-zinc-300 px-2 py-0.5 text-right text-[12.5px] font-mono"
            />
            <button
              onClick={saveRate}
              disabled={busy}
              className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
              title="Enregistrer"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                setDraft(line.hourlyGrossRate != null ? String(line.hourlyGrossRate) : "");
                setEditing(false);
              }}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
              title="Annuler"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 font-mono tabular-nums hover:text-violet-700"
            title="Cliquer pour modifier"
          >
            {line.hourlyGrossRate != null ? `${line.hourlyGrossRate.toFixed(2)} €` : "—"}
            <Pencil className="h-3 w-3 opacity-50" />
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {line.taskHoursRegular.toFixed(1)} h
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {overtime > 0 ? (
          <span title={`+25% : ${line.overtimeHours25.toFixed(1)}h, +50% : ${line.overtimeHours50.toFixed(1)}h`}>
            +{overtime.toFixed(1)} h
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {(line.paidLeaveHours + line.trainingHours) > 0
          ? `${(line.paidLeaveHours + line.trainingHours).toFixed(1)} h`
          : <span className="text-zinc-400">—</span>}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">
        {line.sickHoursEmployerPaid > 0 || line.sickHoursWaitingPeriod > 0 ? (
          <span title={`Carence (3j non payés) : ${line.sickHoursWaitingPeriod.toFixed(1)}h · CPAM (info) : ${line.sickHoursCpam.toFixed(1)}h`}>
            {line.sickHoursEmployerPaid.toFixed(1)} h
          </span>
        ) : <span className="text-zinc-400">—</span>}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">
        {fmt(line.grossEmployer)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700">
        {fmt(line.netEstimated)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-violet-900">
        {fmt(line.totalEmployerCost)}
      </td>
    </tr>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}
