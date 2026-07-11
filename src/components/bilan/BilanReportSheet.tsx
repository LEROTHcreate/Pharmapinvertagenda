"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import {
  BILAN_FIELDS,
  BILAN_GROUPS,
  computeBilanRatios,
  fieldEvolution,
  type BilanData,
} from "@/lib/bilan-fields";

type Reco = { domaine: string; titre: string; detail: string; priorite: "haute" | "moyenne" | "basse" };
type Analysis = {
  synthese: string;
  forces: string[];
  vigilance: string[];
  recommandations: Reco[];
};

const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const pct = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n * 100)} %`;

/**
 * Rapport A4 imprimable d'un bilan : postes N/N-1 + variation, ratios clés et
 * analyse experte (Hygie). Pensé pour archiver ou transmettre à l'expert-comptable.
 * S'auto-imprime au chargement (ouvre le dialogue « Enregistrer en PDF »).
 */
export function BilanReportSheet({
  pharmacyName,
  bilan,
}: {
  pharmacyName: string;
  bilan: {
    label: string;
    year: number;
    kind: "REEL" | "ESTIMATION";
    data: BilanData;
    dataPrev: BilanData;
    analysis: Analysis | null;
    updatedAt: string;
  };
}) {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 400);
    return () => clearTimeout(id);
  }, []);

  const hasPrev = Object.keys(bilan.dataPrev).length > 0;
  const ratios = computeBilanRatios(bilan.data);
  const ratiosPrev = hasPrev ? computeBilanRatios(bilan.dataPrev) : [];
  const a = bilan.analysis;

  return (
    <div className="bilan-report mx-auto max-w-[820px] p-6 text-zinc-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          main { zoom: 1 !important; }
          .bilan-report { font-size: 10.5pt; }
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
      <header className="mb-5 border-b-2 border-zinc-800 pb-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight">{pharmacyName}</h1>
            <p className="text-[13px] text-zinc-600">
              Analyse de bilan — {bilan.label} · exercice {bilan.year}{" "}
              <span className="text-zinc-400">
                ({bilan.kind === "ESTIMATION" ? "estimation" : "chiffres réels"})
              </span>
            </p>
          </div>
          <p className="text-right text-[11px] text-zinc-500">
            Édité le{" "}
            {new Date(bilan.updatedAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            <span className="block">PharmaPlanning · Hygie</span>
          </p>
        </div>
      </header>

      {/* Synthèse */}
      {a?.synthese && (
        <section className="avoid-break mb-5 rounded-lg bg-violet-50 p-3">
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-violet-700">Synthèse</h2>
          <p className="text-[12.5px] leading-snug">{a.synthese}</p>
        </section>
      )}

      {/* Postes financiers N / N-1 / Δ */}
      <section className="avoid-break mb-5">
        <h2 className="mb-2 text-[13px] font-bold">Postes financiers</h2>
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="bg-zinc-100 text-left">
              <th className="border border-zinc-300 px-2 py-1 font-semibold">Poste</th>
              <th className="border border-zinc-300 px-2 py-1 text-right font-semibold">{bilan.year} (N)</th>
              {hasPrev && (
                <>
                  <th className="border border-zinc-300 px-2 py-1 text-right font-semibold">{bilan.year - 1} (N-1)</th>
                  <th className="border border-zinc-300 px-2 py-1 text-right font-semibold">Δ</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {BILAN_GROUPS.map((group) => {
              const fields = BILAN_FIELDS.filter(
                (f) => f.group === group && (typeof bilan.data[f.key] === "number" || typeof bilan.dataPrev[f.key] === "number")
              );
              if (fields.length === 0) return null;
              return (
                <FragmentGroup key={group}>
                  <tr>
                    <td
                      colSpan={hasPrev ? 4 : 2}
                      className="border border-zinc-300 bg-zinc-50 px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide text-zinc-500"
                    >
                      {group}
                    </td>
                  </tr>
                  {fields.map((f) => {
                    const evo = hasPrev ? fieldEvolution(bilan.data, bilan.dataPrev, f.key) : null;
                    return (
                      <tr key={f.key}>
                        <td className="border border-zinc-300 px-2 py-1">{f.label}</td>
                        <td className="border border-zinc-300 px-2 py-1 text-right tabular-nums">
                          {typeof bilan.data[f.key] === "number" ? eur(bilan.data[f.key] as number) : "—"}
                        </td>
                        {hasPrev && (
                          <>
                            <td className="border border-zinc-300 px-2 py-1 text-right tabular-nums text-zinc-500">
                              {typeof bilan.dataPrev[f.key] === "number" ? eur(bilan.dataPrev[f.key] as number) : "—"}
                            </td>
                            <td className="border border-zinc-300 px-2 py-1 text-right tabular-nums">
                              {evo != null ? pct(evo) : "—"}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </FragmentGroup>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Ratios */}
      <section className="avoid-break mb-5">
        <h2 className="mb-2 text-[13px] font-bold">Ratios clés</h2>
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="bg-zinc-100 text-left">
              <th className="border border-zinc-300 px-2 py-1 font-semibold">Ratio</th>
              <th className="border border-zinc-300 px-2 py-1 text-right font-semibold">{bilan.year}</th>
              {hasPrev && <th className="border border-zinc-300 px-2 py-1 text-right font-semibold">{bilan.year - 1}</th>}
              <th className="border border-zinc-300 px-2 py-1 font-semibold">Repère</th>
            </tr>
          </thead>
          <tbody>
            {ratios.map((r) => {
              const p = ratiosPrev.find((x) => x.key === r.key);
              return (
                <tr key={r.key}>
                  <td className="border border-zinc-300 px-2 py-1">{r.label}</td>
                  <td className="border border-zinc-300 px-2 py-1 text-right font-semibold tabular-nums">{r.value}</td>
                  {hasPrev && (
                    <td className="border border-zinc-300 px-2 py-1 text-right tabular-nums text-zinc-500">
                      {p?.value ?? "—"}
                    </td>
                  )}
                  <td className="border border-zinc-300 px-2 py-1 text-[9.5px] text-zinc-500">{r.hint}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Forces & vigilance */}
      {a && (a.forces.length > 0 || a.vigilance.length > 0) && (
        <section className="avoid-break mb-5 grid grid-cols-2 gap-4">
          {a.forces.length > 0 && (
            <div>
              <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Forces</h2>
              <ul className="space-y-0.5">
                {a.forces.map((f, i) => (
                  <li key={i} className="text-[11px]">• {f}</li>
                ))}
              </ul>
            </div>
          )}
          {a.vigilance.length > 0 && (
            <div>
              <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">Points de vigilance</h2>
              <ul className="space-y-0.5">
                {a.vigilance.map((v, i) => (
                  <li key={i} className="text-[11px]">• {v}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Recommandations */}
      {a && a.recommandations.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-bold">Recommandations</h2>
          <ol className="space-y-2">
            {a.recommandations.map((r, i) => (
              <li key={i} className="avoid-break rounded-lg border border-zinc-300 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold">
                    {i + 1}. {r.titre}
                  </span>
                  <span className="shrink-0 text-[9.5px] uppercase tracking-wide text-zinc-500">
                    {r.domaine} · priorité {r.priorite}
                  </span>
                </div>
                {r.detail && <p className="mt-0.5 text-[11px] leading-snug text-zinc-700">{r.detail}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {!a && (
        <p className="mb-5 rounded-lg bg-amber-50 p-3 text-[11.5px] text-amber-800">
          Ce rapport ne contient pas encore l'analyse Hygie. Lance « Analyser » sur la page Bilan
          puis ré-exporte pour l'inclure.
        </p>
      )}

      <footer className="mt-6 border-t border-zinc-300 pt-2 text-[9px] text-zinc-400">
        Document indicatif généré par PharmaPlanning (Hygie) à partir des données saisies. Il ne
        remplace pas l'avis de votre expert-comptable ou avocat : validez toute décision importante
        avec eux.
      </footer>
    </div>
  );
}

/** Regroupe des <tr> sans nœud DOM intermédiaire (évite un <div> dans <tbody>). */
function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
