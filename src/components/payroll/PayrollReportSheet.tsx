"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { STATUS_LABELS } from "@/types";
import type { PayrollMonthResult } from "@/lib/payroll-month";

const eur = (n: number) =>
  Math.round(n).toLocaleString("fr-FR") + " €";
const h1 = (n: number) => (n > 0 ? n.toFixed(1).replace(".", ",") : "—");

/** Libellé lisible d'un mois "YYYY-MM". */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

const REGION_LABEL: Record<string, string> = {
  NATIONAL: "France (moyenne nationale)",
  IDF: "Île-de-France",
  PROVINCE: "Province",
};

/**
 * Récapitulatif de rémunération A4 imprimable / PDF pour un mois : masse
 * salariale, détail par collaborateur (heures, brut, net, coût employeur) et
 * totaux. Pensé pour archiver ou transmettre à l'expert-comptable. S'auto-imprime
 * au chargement (ouvre le dialogue « Enregistrer en PDF »).
 */
export function PayrollReportSheet({
  pharmacyName,
  data,
}: {
  pharmacyName: string;
  data: PayrollMonthResult;
}) {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 400);
    return () => clearTimeout(id);
  }, []);

  // Lignes réellement rémunérées (rému saisie) — les autres sont ignorées.
  const lines = data.lines.filter((l) => l.totalEmployerCost > 0);
  const ratio =
    data.revenue?.revenueHT && data.revenue.revenueHT > 0
      ? data.totals.totalEmployerCost / data.revenue.revenueHT
      : null;

  return (
    <div className="payroll-report mx-auto max-w-[1120px] p-6 text-zinc-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          main { zoom: 1 !important; }
          .payroll-report { font-size: 9.5pt; }
          .avoid-break { break-inside: avoid; }
        }
      `}</style>

      {/* Bouton (écran uniquement) */}
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-violet-700"
        >
          <Printer className="h-4 w-4" /> Imprimer / Enregistrer en PDF
        </button>
      </div>

      {/* En-tête */}
      <header className="mb-4 border-b-2 border-zinc-800 pb-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight">
              {pharmacyName}
            </h1>
            <p className="text-[13px] capitalize text-zinc-600">
              Récapitulatif de rémunération — {monthLabel(data.month)}
            </p>
          </div>
          <p className="text-right text-[11px] text-zinc-500">
            Édité le{" "}
            {new Date().toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            <span className="block">
              {REGION_LABEL[data.region] ?? data.region} · PharmaPlanning
            </span>
          </p>
        </div>
      </header>

      {/* Cartes de synthèse */}
      <section className="avoid-break mb-4 grid grid-cols-4 gap-3">
        <SummaryBox
          label="Masse salariale (coût employeur)"
          value={eur(data.totals.totalEmployerCost)}
          strong
        />
        <SummaryBox label="Brut total" value={eur(data.totals.grossEmployer)} />
        <SummaryBox
          label="Cotisations patronales"
          value={eur(data.totals.socialContributionsEmployer)}
        />
        <SummaryBox
          label="Net estimé versé"
          value={eur(data.totals.netEstimated)}
        />
      </section>

      {ratio != null && (
        <p className="mb-4 rounded-lg bg-violet-50 px-3 py-1.5 text-[11.5px] text-violet-900">
          Ratio masse salariale / CA HT du mois :{" "}
          <span className="font-bold">
            {(ratio * 100).toFixed(1).replace(".", ",")} %
          </span>{" "}
          <span className="text-violet-700/70">
            (CA HT saisi : {eur(data.revenue!.revenueHT)})
          </span>
        </p>
      )}

      {/* Détail par collaborateur */}
      <section className="avoid-break">
        <h2 className="mb-2 text-[13px] font-bold">Détail par collaborateur</h2>
        {lines.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-3 text-[11.5px] text-amber-800">
            Aucune rémunération saisie pour ce mois. Renseigne les taux dans la
            fiche des collaborateurs, puis ré-exporte.
          </p>
        ) : (
          <table className="w-full border-collapse text-[9.5px]">
            <thead>
              <tr className="bg-zinc-100 text-left">
                <Th>Collaborateur</Th>
                <Th>Statut</Th>
                <Th right>H. trav.</Th>
                <Th right>HS +25%</Th>
                <Th right>HS +50%</Th>
                <Th right>Abs. payées</Th>
                <Th right>Brut empl.</Th>
                <Th right>Cotis. sal.</Th>
                <Th right>Net estimé</Th>
                <Th right>Cotis. patr.</Th>
                <Th right>Coût total</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const absPaid =
                  l.paidLeaveHours +
                  l.trainingHours +
                  l.sickHoursEmployerPaid;
                return (
                  <tr key={l.employeeId}>
                    <Td>{l.employeeName}</Td>
                    <Td className="text-zinc-500">
                      {STATUS_LABELS[l.status]}
                    </Td>
                    <Td right>{h1(l.taskHoursRegular)}</Td>
                    <Td right>{h1(l.overtimeHours25)}</Td>
                    <Td right>{h1(l.overtimeHours50)}</Td>
                    <Td right>{h1(absPaid)}</Td>
                    <Td right>{eur(l.grossEmployer)}</Td>
                    <Td right className="text-zinc-500">
                      {eur(l.socialContributionsEmployee)}
                    </Td>
                    <Td right>{eur(l.netEstimated)}</Td>
                    <Td right className="text-zinc-500">
                      {eur(l.socialContributionsEmployer)}
                    </Td>
                    <Td right className="font-semibold">
                      {eur(l.totalEmployerCost)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-100 font-bold">
                <Td>Total</Td>
                <Td />
                <Td right />
                <Td right />
                <Td right />
                <Td right />
                <Td right>{eur(data.totals.grossEmployer)}</Td>
                <Td right />
                <Td right>{eur(data.totals.netEstimated)}</Td>
                <Td right>{eur(data.totals.socialContributionsEmployer)}</Td>
                <Td right>{eur(data.totals.totalEmployerCost)}</Td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <footer className="mt-6 border-t border-zinc-300 pt-2 text-[9px] text-zinc-400">
        Montants indicatifs estimés par PharmaPlanning à partir des heures
        planifiées et des taux saisis (cotisations approchées, réduction générale
        et loi TEPA incluses). Ce document ne remplace PAS le bulletin de paie
        officiel ni le calcul de votre expert-comptable / gestionnaire de paie.
      </footer>
    </div>
  );
}

function SummaryBox({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "rounded-lg border-2 border-violet-300 bg-violet-50 px-3 py-2"
          : "rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2"
      }
    >
      <p className="text-[9.5px] uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p
        className={
          strong
            ? "text-[16px] font-bold tabular-nums text-violet-800"
            : "text-[15px] font-semibold tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Th({
  children,
  right,
}: {
  children?: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className={`border border-zinc-300 px-2 py-1 font-semibold ${right ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className = "",
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border border-zinc-300 px-2 py-1 tabular-nums ${right ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
