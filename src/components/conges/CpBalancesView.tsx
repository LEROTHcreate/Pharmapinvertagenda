"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { STATUS_LABELS } from "@/types";
import { cn } from "@/lib/utils";
import { CP_HIGH_THRESHOLD, CP_PER_MONTH, type CpBalance } from "@/lib/conges-paies";
import { setCpBase } from "@/app/(dashboard)/absences/conges-actions";

/** "2026-06-01" → "01/06/2026". */
function frDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
const nbjours = (n: number) =>
  `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`;

/**
 * Soldes de congés payés — RÉSERVÉ AU TITULAIRE. Affiche par collaborateur les
 * CP acquis (2,5 j/mois) / pris / restants, avec alerte « solde élevé à
 * écouler », et permet de saisir le solde de référence (point de départ fiable).
 */
export function CpBalancesView({
  data,
  onGoToAbsences,
}: {
  data: CpBalance[];
  /** Bascule vers l'onglet Absences (poser un congé). */
  onGoToAbsences: () => void;
}) {
  const [editing, setEditing] = React.useState<string | null>(null);

  const highCount = data.filter((c) => c.high).length;
  const totalRemaining = data.reduce((s, c) => s + c.remaining, 0);

  return (
    <div className="space-y-4">
      {/* Bandeau info + alerte globale */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-foreground">
            Compteur indicatif — {CP_PER_MONTH} j acquis / mois (5 semaines / an)
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Solde restant total équipe :{" "}
            <strong className="tabular-nums text-foreground">
              {nbjours(totalRemaining)}
            </strong>
            . Estimation de gestion (pas un décompte légal). Réservé au titulaire.
          </p>
        </div>
        {highCount > 0 && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {highCount} solde{highCount > 1 ? "s" : ""} élevé
            {highCount > 1 ? "s" : ""} à écouler (≥ {CP_HIGH_THRESHOLD} j)
          </span>
        )}
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Collaborateur</th>
              <th className="px-3 py-2.5 text-right font-medium">Solde réf.</th>
              <th className="px-3 py-2.5 text-right font-medium">Acquis</th>
              <th className="px-3 py-2.5 text-right font-medium">Pris</th>
              <th className="px-3 py-2.5 text-right font-medium">Restant</th>
              <th className="w-1 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((c) => (
              <CpRow
                key={c.id}
                cp={c}
                editing={editing === c.id}
                onEdit={() => setEditing(c.id)}
                onClose={() => setEditing(null)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          « Pris » = jours de congé (CONGE) posés depuis la date de référence.
          Renseigne le <strong>solde de référence</strong> de chacun (crayon) pour
          un compteur fiable dès l&apos;adoption de l&apos;app.
        </p>
        <button
          onClick={onGoToAbsences}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          Poser un congé
        </button>
      </div>
    </div>
  );
}

function CpRow({
  cp,
  editing,
  onEdit,
  onClose,
}: {
  cp: CpBalance;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [balance, setBalance] = React.useState(String(cp.base));
  const [date, setDate] = React.useState(cp.baseDate ?? todayIso());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await setCpBase({
      employeeId: cp.id,
      balance: Math.max(0, Number(balance.replace(",", ".")) || 0),
      date,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <>
      <tr className="hover:bg-muted/30">
        <td className="px-3 py-2 font-medium">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: cp.displayColor }}
            />
            {cp.firstName} {cp.lastName}
            <span className="text-[11px] font-normal text-muted-foreground">
              {STATUS_LABELS[cp.status]}
            </span>
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
          {cp.hasBase ? (
            <span title={`au ${frDate(cp.baseDate)}`}>{nbjours(cp.base)}</span>
          ) : (
            <span className="text-[11px] italic text-muted-foreground/60">
              non saisi
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
          +{nbjours(cp.acquired)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
          −{nbjours(cp.taken)}
        </td>
        <td className="px-3 py-2 text-right">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono font-semibold tabular-nums",
              cp.high
                ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50"
                : cp.remaining < 0
                  ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300"
                  : "text-foreground"
            )}
            title={cp.high ? "Solde élevé à écouler" : undefined}
          >
            {cp.high && <AlertTriangle className="h-3 w-3" />}
            {nbjours(cp.remaining)}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <button
            onClick={editing ? onClose : onEdit}
            aria-label="Modifier le solde de référence"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-3 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">
                  Solde de référence (jours)
                </span>
                <input
                  inputMode="decimal"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  className="h-9 w-32 rounded-md border border-border bg-background px-2.5 text-[13px] outline-none focus:border-violet-400"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">
                  À la date du
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-2 text-[13px] outline-none focus:border-violet-400"
                />
              </label>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-600 px-3 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Enregistrer
              </button>
              {error && (
                <span className="text-[12px] text-rose-600">{error}</span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              Saisis le solde CP réel de {cp.firstName} à une date connue (ex. le
              1ᵉʳ juin). Le compteur repart de là : + {CP_PER_MONTH} j/mois − les
              congés posés ensuite.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
