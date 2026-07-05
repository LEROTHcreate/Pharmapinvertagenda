"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  CalendarPlus,
  Scale,
  Euro,
  Trash2,
  Sparkles,
  Moon,
  Sun,
  CalendarDays,
} from "lucide-react";
import {
  GARDE_TYPES,
  GARDE_TYPE_LABELS,
  type GardeType,
  type GardeRates,
} from "@/lib/gardes";

type Pharmacist = { id: string; name: string; color: string };
type UpcomingGarde = {
  id: string;
  date: string;
  type: GardeType;
  extraMajorations: GardeType[];
  pharmacistId: string;
  pharmacistName: string;
};
type EquityCount = {
  name: string;
  total: number;
  byType: Record<GardeType, number>;
};

export type GardesData = {
  isAdmin: boolean;
  pharmacists: Pharmacist[];
  upcoming: UpcomingGarde[];
  equity: {
    average: number;
    spread: number;
    leastLoaded: string[];
    counts: EquityCount[];
  };
  suggestion: string[];
  rates: GardeRates;
  ratesAreCustom: boolean;
  indemnites: { total: number; byPharmacist: { name: string; amount: number }[] };
};

const TYPE_ICON: Record<GardeType, React.ReactNode> = {
  NUIT: <Moon className="h-3.5 w-3.5" />,
  DIMANCHE: <Sun className="h-3.5 w-3.5" />,
  JOUR_FERIE: <CalendarDays className="h-3.5 w-3.5" />,
};

const euros = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export function GardesView(data: GardesData) {
  const router = useRouter();
  const {
    isAdmin,
    pharmacists,
    upcoming,
    equity,
    suggestion,
    rates,
    ratesAreCustom,
    indemnites,
  } = data;

  const noPharmacists = pharmacists.length === 0;

  return (
    <div className="p-3 md:p-4 lg:p-6 pb-16">
      {/* En-tête (pleine largeur) */}
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Pharmacie de garde
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Rotation des gardes, équité et indemnités — pharmaciens et titulaires.
          </p>
        </div>
      </header>

      {noPharmacists ? (
        <Section
          title="Aucun pharmacien ni titulaire"
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <p className="text-[13px] text-muted-foreground">
            Ajoutez des collaborateurs de statut « Pharmacien » ou « Titulaire »
            pour organiser les gardes.
          </p>
        </Section>
      ) : (
        <>
          {/* Suggestion prochaine garde (pleine largeur, en tête d'affiche) */}
          <div className="mb-5 rounded-2xl border border-indigo-200/70 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900/50 dark:bg-indigo-950/25">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <p className="text-[13px] text-indigo-900 dark:text-indigo-200">
                {suggestion.length > 0 ? (
                  <>
                    Prochaine garde suggérée pour{" "}
                    <span className="font-semibold">
                      {suggestion.join(", ")}
                    </span>{" "}
                    <span className="opacity-70">(le/les moins chargé·s)</span>
                  </>
                ) : (
                  "Rotation équilibrée."
                )}
              </p>
            </div>
          </div>

          {isAdmin && (
            <AddGardeForm
              pharmacists={pharmacists}
              onDone={() => router.refresh()}
            />
          )}

          {/* Grille masonry : les 3 panneaux d'info se répartissent sur la
              largeur (1 / 2 / 3 colonnes selon l'écran), sans être coupés. */}
          <div className="columns-1 gap-5 md:columns-2 xl:columns-3">
          {/* Gardes à venir */}
          <Section
            title="Gardes à venir"
            icon={<CalendarPlus className="h-4 w-4" />}
            count={upcoming.length}
          >
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Aucune garde programmée.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                      {TYPE_ICON[g.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-tight text-foreground">
                        {g.pharmacistName}
                      </p>
                      <p className="mt-0.5 text-[12px] capitalize text-muted-foreground">
                        {dateLabel(g.date)} ·{" "}
                        {[g.type, ...g.extraMajorations]
                          .map((t) => GARDE_TYPE_LABELS[t])
                          .join(" + ")}
                      </p>
                    </div>
                    {isAdmin && (
                      <DeleteGardeButton id={g.id} onDone={() => router.refresh()} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Équité */}
          <Section
            title="Équité de la rotation"
            icon={<Scale className="h-4 w-4" />}
          >
            <p className="mb-2 text-[12px] text-muted-foreground">
              Moyenne {equity.average.toFixed(1)} garde·s / personne · écart
              max {equity.spread}
              {equity.leastLoaded.length > 0 && (
                <> · à rattraper : {equity.leastLoaded.join(", ")}</>
              )}
            </p>
            <ul className="space-y-1.5">
              {equity.counts.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center gap-3 rounded-lg bg-muted/20 px-3 py-2 text-[12.5px]"
                >
                  <span className="flex-1 font-medium text-foreground">
                    {c.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {GARDE_TYPES.map((t) => `${c.byType[t]} ${GARDE_TYPE_LABELS[t].toLowerCase()}`).join(" · ")}
                  </span>
                  <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-foreground">
                    {c.total}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Indemnités */}
          <Section
            title="Indemnités estimées"
            icon={<Euro className="h-4 w-4" />}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[13px] text-muted-foreground">
                Total sur la période
              </span>
              <span className="text-[16px] font-semibold tabular-nums text-foreground">
                {euros(indemnites.total)}
              </span>
            </div>
            {indemnites.byPharmacist.length > 0 && (
              <ul className="space-y-1">
                {indemnites.byPharmacist.map((p) => (
                  <li
                    key={p.name}
                    className="flex items-center justify-between text-[12.5px]"
                  >
                    <span className="text-foreground/85">{p.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {euros(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {isAdmin && (
              <RatesForm
                rates={rates}
                ratesAreCustom={ratesAreCustom}
                onDone={() => router.refresh()}
              />
            )}
            {!isAdmin && !ratesAreCustom && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Taux indicatifs par défaut — un administrateur peut les régler.
              </p>
            )}
          </Section>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Formulaire d'ajout ─────────────────────────────────────────── */

function AddGardeForm({
  pharmacists,
  onDone,
}: {
  pharmacists: Pharmacist[];
  onDone: () => void;
}) {
  const [pharmacistId, setPharmacistId] = useState(pharmacists[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [type, setType] = useState<GardeType>("NUIT");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date) {
      setError("Choisissez une date.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/gardes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pharmacistId, date, type }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Échec de l'enregistrement");
      }
      setDate("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Ajouter une garde" icon={<CalendarPlus className="h-4 w-4" />}>
      <form onSubmit={submit} className="space-y-2.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <select
            value={pharmacistId}
            onChange={(e) => setPharmacistId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
          >
            {pharmacists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as GardeType)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
          >
            {GARDE_TYPES.map((t) => (
              <option key={t} value={t}>
                {GARDE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-[12px] text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          <CalendarPlus className="h-4 w-4" />
          {saving ? "Enregistrement…" : "Ajouter la garde"}
        </button>
      </form>
    </Section>
  );
}

function DeleteGardeButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try {
      await fetch(`/api/gardes?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={del}
      disabled={busy}
      aria-label="Supprimer la garde"
      className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/30"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

/* ─── Réglage des taux ───────────────────────────────────────────── */

function RatesForm({
  rates,
  ratesAreCustom,
  onDone,
}: {
  rates: GardeRates;
  ratesAreCustom: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nuit, setNuit] = useState(String(rates.NUIT));
  const [dimanche, setDimanche] = useState(String(rates.DIMANCHE));
  const [ferie, setFerie] = useState(String(rates.JOUR_FERIE));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/gardes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rateNuit: Number(nuit),
          rateDimanche: Number(dimanche),
          rateJourFerie: Number(ferie),
        }),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-[12px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Régler les taux d'indemnité{ratesAreCustom ? "" : " (défauts indicatifs)"}
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Nuit", value: nuit, set: setNuit },
          { label: "Dimanche", value: dimanche, set: setDimanche },
          { label: "Férié", value: ferie, set: setFerie },
        ].map((f) => (
          <label key={f.label} className="text-[11px] text-muted-foreground">
            {f.label} (€)
            <input
              type="number"
              min={0}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

/* ─── Section réutilisable ───────────────────────────────────────── */

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 break-inside-avoid rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.06)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400">
          {icon}
        </span>
        <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {count != null && count > 0 && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
