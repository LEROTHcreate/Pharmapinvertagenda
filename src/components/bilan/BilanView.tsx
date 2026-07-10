"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  Plus,
  Upload,
  Sparkles,
  Trash2,
  Loader2,
  Save,
  ClipboardPaste,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronRight,
  Scale,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  BILAN_FIELDS,
  BILAN_GROUPS,
  computeBilanRatios,
  fieldEvolution,
  type BilanData,
  type BilanFieldKey,
  type BilanRatio,
} from "@/lib/bilan-fields";

type Kind = "REEL" | "ESTIMATION";
type Which = "data" | "dataPrev";
type Reco = {
  domaine: string;
  titre: string;
  detail: string;
  priorite: "haute" | "moyenne" | "basse";
};
type Analysis = {
  synthese: string;
  forces: string[];
  vigilance: string[];
  recommandations: Reco[];
};
type Bilan = {
  id: string;
  year: number;
  label: string;
  kind: Kind;
  data: BilanData;
  dataPrev: BilanData | null;
  analysis: Analysis | null;
  sourceName: string | null;
  updatedAt: string;
};

type Draft = {
  id: string | null;
  year: number;
  label: string;
  kind: Kind;
  data: BilanData;
  dataPrev: BilanData;
  sourceName: string | null;
};

const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";

export function BilanView({ pharmacyName }: { pharmacyName: string }) {
  const { toast } = useToast();
  const [bilans, setBilans] = useState<Bilan[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [compare, setCompare] = useState(false);

  async function load(selectId?: string) {
    const res = await fetch("/api/bilan");
    const d = await res.json().catch(() => ({}));
    const list: Bilan[] = res.ok ? d.bilans ?? [] : [];
    setBilans(list);
    const target = selectId
      ? list.find((b) => b.id === selectId)
      : draft?.id
        ? list.find((b) => b.id === draft.id)
        : list[0];
    if (target) selectBilan(target);
    else if (list.length === 0) setDraft(null);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectBilan(b: Bilan) {
    setDraft({
      id: b.id,
      year: b.year,
      label: b.label,
      kind: b.kind,
      data: { ...b.data },
      dataPrev: { ...(b.dataPrev ?? {}) },
      sourceName: b.sourceName,
    });
    setAnalysis(b.analysis);
    setDirty(false);
  }

  function newBilan() {
    const y = new Date().getFullYear() - 1;
    setDraft({ id: null, year: y, label: `Bilan ${y}`, kind: "REEL", data: {}, dataPrev: {}, sourceName: null });
    setAnalysis(null);
    setDirty(true);
    setCompare(false);
  }

  function setField(key: BilanFieldKey, value: string, which: Which) {
    setDraft((prev) => {
      if (!prev) return prev;
      const target = { ...prev[which] };
      const n = value === "" ? NaN : Number(value.replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n)) target[key] = n;
      else delete target[key];
      return { ...prev, [which]: target };
    });
    setDirty(true);
  }

  function setMeta(patch: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  async function save(): Promise<string | null> {
    if (!draft) return null;
    if (!draft.label.trim()) {
      toast({ tone: "error", title: "Nom manquant", description: "Donne un nom au bilan." });
      return null;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/bilan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft.id ?? undefined,
          year: draft.year,
          label: draft.label.trim(),
          kind: draft.kind,
          data: draft.data,
          dataPrev: draft.dataPrev,
          sourceName: draft.sourceName,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ tone: "error", title: "Enregistrement impossible", description: d.error ?? "Réessaie." });
        return null;
      }
      const id = d.id as string;
      setDirty(false);
      await load(id);
      return id;
    } finally {
      setSaving(false);
    }
  }

  async function analyze() {
    if (!draft) return;
    setAnalyzing(true);
    try {
      // On enregistre d'abord si nécessaire (l'analyse porte sur un bilan sauvé).
      let id = draft.id;
      if (dirty || !id) id = await save();
      if (!id) return;
      const res = await fetch("/api/bilan/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ tone: "error", title: "Analyse impossible", description: d.error ?? "Réessaie." });
        return;
      }
      setAnalysis(d.analysis as Analysis);
      await load(id);
    } finally {
      setAnalyzing(false);
    }
  }

  async function remove(b: Bilan) {
    if (!confirm(`Supprimer « ${b.label} » ?`)) return;
    const res = await fetch(`/api/bilan/${b.id}`, { method: "DELETE" });
    if (res.ok) {
      if (draft?.id === b.id) setDraft(null);
      await load();
    }
  }

  const ratios = useMemo(() => (draft ? computeBilanRatios(draft.data) : []), [draft]);
  const ratiosPrev = useMemo(
    () => (draft && Object.keys(draft.dataPrev).length > 0 ? computeBilanRatios(draft.dataPrev) : []),
    [draft]
  );

  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6 space-y-6">
      {/* En-tête */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <FileSpreadsheet className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Bilan &amp; décisions</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Importe le bilan de {pharmacyName} (exercice N &amp; N-1), suis les ratios et leur
              évolution, et obtiens des décisions expertes (comptable, fiscal, juridique,
              investissement) avec Hygie.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {bilans && bilans.length > 1 && (
            <button
              onClick={() => setCompare((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors",
                compare ? "border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "border-border text-foreground/80 hover:bg-muted/50"
              )}
            >
              <Scale className="h-4 w-4" /> Comparer
            </button>
          )}
          <button
            onClick={newBilan}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" /> Nouveau bilan
          </button>
        </div>
      </header>

      {/* Sélecteur de bilans */}
      {bilans && (bilans.length > 0 || draft) && (
        <div className="flex flex-wrap gap-2">
          {bilans.map((b) => (
            <button
              key={b.id}
              onClick={() => selectBilan(b)}
              className={cn(
                "group inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] transition-colors",
                draft?.id === b.id
                  ? "border-violet-400 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                  : "border-border bg-card text-foreground/80 hover:bg-muted/50"
              )}
            >
              <span className="font-medium">{b.label}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {b.kind === "ESTIMATION" ? "estim." : "réel"}
              </span>
            </button>
          ))}
          {draft && !draft.id && (
            <span className="inline-flex items-center gap-2 rounded-xl border border-dashed border-violet-400 bg-violet-50/50 px-3 py-1.5 text-[13px] text-violet-700 dark:bg-violet-950/20 dark:text-violet-300">
              {draft.label} <span className="text-[10px]">(non enregistré)</span>
            </span>
          )}
        </div>
      )}

      {/* Comparaison des ratios */}
      {compare && bilans && bilans.length > 1 && <CompareTable bilans={bilans} />}

      {/* Contenu principal */}
      {bilans === null ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !draft ? (
        <EmptyState onCreate={newBilan} />
      ) : (
        !compare && (
          <div className="grid gap-5 xl:grid-cols-3">
            {/* Colonne saisie / import */}
            <div className="space-y-5 xl:col-span-2">
              <MetaBar
                draft={draft}
                setMeta={setMeta}
                onSave={save}
                onRemoveSelf={() => {
                  const b = bilans.find((x) => x.id === draft.id);
                  if (b) remove(b);
                }}
                saving={saving}
                dirty={dirty}
              />
              <ImportPanel
                onExtracted={(data, dataPrev, sourceName) => {
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          data: { ...prev.data, ...data },
                          dataPrev: { ...prev.dataPrev, ...dataPrev },
                          sourceName: sourceName ?? prev.sourceName,
                        }
                      : prev
                  );
                  setDirty(true);
                }}
              />
              <FormFields data={draft.data} dataPrev={draft.dataPrev} year={draft.year} onChange={setField} />
            </div>

            {/* Colonne ratios + analyse */}
            <div className="space-y-5">
              <RatiosPanel ratios={ratios} ratiosPrev={ratiosPrev} />
              <AnalysisPanel
                analysis={analysis}
                analyzing={analyzing}
                onAnalyze={analyze}
                hasData={Object.keys(draft.data).length > 0}
                hasPrev={Object.keys(draft.dataPrev).length > 0}
              />
            </div>
          </div>
        )
      )}

      <p className="text-[11px] text-muted-foreground/70">
        Analyses et ratios indicatifs, générés à partir des données saisies. Ils ne remplacent
        pas ton expert-comptable / avocat : valide toute décision importante avec eux.
      </p>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <FileSpreadsheet className="mx-auto h-9 w-9 text-muted-foreground/50" />
      <p className="mt-3 text-[15px] font-medium text-foreground">Aucun bilan</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
        Importe le PDF de ton bilan comptable : l'IA lit tout le dossier et remplit les valeurs de
        l'exercice N et de l'année précédente. Tu obtiens ensuite les ratios, leur évolution et des
        recommandations expertes.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-violet-700"
      >
        <Plus className="h-4 w-4" /> Créer un bilan
      </button>
    </div>
  );
}

function MetaBar({
  draft,
  setMeta,
  onSave,
  onRemoveSelf,
  saving,
  dirty,
}: {
  draft: Draft;
  setMeta: (p: Partial<Draft>) => void;
  onSave: () => void;
  onRemoveSelf: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
      <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
        Nom
        <input
          value={draft.label}
          maxLength={80}
          onChange={(e) => setMeta({ label: e.target.value })}
          className="w-52 rounded-lg border border-input bg-card px-2.5 py-1.5 text-[14px] text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
        Année (N)
        <input
          type="number"
          value={draft.year}
          onChange={(e) => setMeta({ year: Number(e.target.value) || draft.year })}
          className="w-24 rounded-lg border border-input bg-card px-2.5 py-1.5 text-[14px] text-foreground tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
        Type
        <select
          value={draft.kind}
          onChange={(e) => setMeta({ kind: e.target.value as Kind })}
          className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-[14px] text-foreground"
        >
          <option value="REEL">Réel</option>
          <option value="ESTIMATION">Estimation / étude</option>
        </select>
      </label>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? "Enregistrer" : "Enregistré"}
        </button>
        {draft.id && (
          <button
            onClick={onRemoveSelf}
            title="Supprimer ce bilan"
            className="rounded-lg p-2 text-muted-foreground/70 hover:bg-muted/60 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ImportPanel({
  onExtracted,
}: {
  onExtracted: (data: BilanData, dataPrev: BilanData, sourceName: string | null) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reportResult(found: number, foundPrev: number, multi: boolean, error?: string) {
    if (found > 0 || foundPrev > 0) {
      toast({
        tone: "success",
        title: `${found} valeur(s) N détectée(s)${foundPrev > 0 ? ` · ${foundPrev} en N-1` : ""}`,
        description: multi ? "Fusionnées depuis tes documents — vérifie et corrige." : "Vérifie et corrige si besoin.",
      });
    } else {
      toast({
        tone: error ? "error" : "info",
        title: error ? "Import impossible" : "Aucune valeur détectée",
        description: error || "Essaie une image plus nette, ou colle le texte du bilan.",
      });
    }
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    try {
      let total = 0;
      let totalPrev = 0;
      let firstError = "";
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/bilan/extract", { method: "POST", body: form });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!firstError) firstError = d.error ?? "Import impossible.";
          continue;
        }
        onExtracted(d.data ?? {}, d.dataPrev ?? {}, d.sourceName ?? file.name);
        total += d.found ?? 0;
        totalPrev += d.foundPrev ?? 0;
      }
      reportResult(total, totalPrev, files.length > 1, total === 0 ? firstError : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function handleText() {
    if (text.trim().length < 20) {
      toast({ tone: "error", title: "Texte trop court", description: "Colle le texte du bilan." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/bilan/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ tone: "error", title: "Extraction impossible", description: d.error ?? "Réessaie." });
        return;
      }
      onExtracted(d.data ?? {}, d.dataPrev ?? {}, null);
      setText("");
      reportResult(d.found ?? 0, d.foundPrev ?? 0, false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4 dark:border-violet-900/40 dark:bg-violet-950/10">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <Upload className="h-4 w-4 text-violet-600 dark:text-violet-300" />
        <span className="text-[13.5px] font-semibold text-foreground">Importer un document</span>
        <span className="text-[12px] text-muted-foreground">— l'IA lit N &amp; N-1</span>
        <ChevronRight className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(Array.from(e.dataTransfer.files ?? []));
            }}
            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-violet-300 bg-card/50 px-4 py-6 text-center hover:border-violet-400 dark:border-violet-800"
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            ) : (
              <FileText className="h-6 w-6 text-violet-500" />
            )}
            <p className="text-[13px] font-medium text-foreground">
              Dépose le PDF du bilan (liasse complète) ou une photo, ou clique pour choisir
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              PDF · JPG · PNG… — l'IA cible les tableaux de synthèse (max 15 Mo)
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou colle le texte <span className="h-px flex-1 bg-border" />
          </div>

          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Colle ici le texte du bilan (ex. page « Analyse de votre entreprise » ou « Soldes intermédiaires de gestion »)…"
              className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-[12.5px] text-foreground"
            />
            <button
              onClick={handleText}
              disabled={busy}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium hover:bg-muted/50 disabled:opacity-60"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> Analyser le texte
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Petite variation N vs N-1 (flèche + %), neutre (le sens est interprété par l'analyse). */
function Delta({ evo }: { evo: number | null }) {
  if (evo == null) return <span className="text-[11px] text-muted-foreground/40">—</span>;
  const up = evo >= 0;
  const strong = Math.abs(evo) >= 0.15;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] tabular-nums",
        strong ? (up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400") : "text-muted-foreground"
      )}
      title="Évolution N vs N-1"
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(Math.round(evo * 100))}%
    </span>
  );
}

function FormFields({
  data,
  dataPrev,
  year,
  onChange,
}: {
  data: BilanData;
  dataPrev: BilanData;
  year: number;
  onChange: (key: BilanFieldKey, value: string, which: Which) => void;
}) {
  return (
    <div className="space-y-4">
      {BILAN_GROUPS.map((group) => (
        <div key={group} className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {group}
          </h3>
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              {/* En-tête colonnes */}
              <div className="grid grid-cols-[minmax(0,1fr)_112px_112px_52px] items-center gap-2 border-b border-border/60 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                <span>Poste</span>
                <span className="text-right">{year} (N)</span>
                <span className="text-right">{year - 1} (N-1)</span>
                <span className="text-right">Δ</span>
              </div>
              {BILAN_FIELDS.filter((f) => f.group === group).map((f) => {
                const evo = fieldEvolution(data, dataPrev, f.key);
                return (
                  <div
                    key={f.key}
                    className="grid grid-cols-[minmax(0,1fr)_112px_112px_52px] items-center gap-2 border-b border-border/40 py-1.5 last:border-0"
                  >
                    <span className="truncate text-[12.5px] font-medium text-foreground" title={f.hint}>
                      {f.label}
                    </span>
                    <EuroInput value={data[f.key]} onChange={(v) => onChange(f.key, v, "data")} />
                    <EuroInput value={dataPrev[f.key]} onChange={(v) => onChange(f.key, v, "dataPrev")} muted />
                    <span className="text-right">
                      <Delta evo={evo} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EuroInput({
  value,
  onChange,
  muted,
}: {
  value: number | undefined;
  onChange: (v: string) => void;
  muted?: boolean;
}) {
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        value={value != null ? String(value) : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={cn(
          "w-full rounded-lg border px-2 py-1 pr-5 text-right text-[12.5px] tabular-nums",
          muted ? "border-border/70 bg-muted/30 text-muted-foreground" : "border-input bg-card text-foreground"
        )}
      />
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">
        €
      </span>
    </div>
  );
}

const RATIO_TONE: Record<BilanRatio["tone"], string> = {
  good: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  bad: "text-rose-700 dark:text-rose-300",
  neutral: "text-muted-foreground",
};
const RATIO_DOT: Record<BilanRatio["tone"], string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  bad: "bg-rose-500",
  neutral: "bg-zinc-300",
};

function RatiosPanel({ ratios, ratiosPrev }: { ratios: BilanRatio[]; ratiosPrev: BilanRatio[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-[13px] font-semibold text-foreground">Ratios clés</h2>
      <ul className="space-y-2.5">
        {ratios.map((r) => {
          const p = ratiosPrev.find((x) => x.key === r.key);
          // Tendance : amélioration si va dans le « bon » sens du ratio.
          let trend: "up" | "down" | null = null;
          if (p && r.raw != null && p.raw != null && r.raw !== p.raw) {
            const better = r.higherIsBetter ? r.raw > p.raw : r.raw < p.raw;
            trend = better ? "up" : "down";
          }
          return (
            <li key={r.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] text-foreground/80" title={r.hint}>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", RATIO_DOT[r.tone])} />
                {r.label}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {p && (
                  <span className="text-[11px] tabular-nums text-muted-foreground/60" title="Exercice N-1">
                    {p.value}
                  </span>
                )}
                {trend && (
                  <span className={cn(trend === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    {trend === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  </span>
                )}
                <span className={cn("text-[14px] font-semibold tabular-nums", RATIO_TONE[r.tone])}>{r.value}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const PRIO_STYLE: Record<Reco["priorite"], string> = {
  haute: "border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20",
  moyenne: "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20",
  basse: "border-border bg-muted/30",
};
const PRIO_BADGE: Record<Reco["priorite"], string> = {
  haute: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  moyenne: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  basse: "bg-muted text-muted-foreground",
};

function AnalysisPanel({
  analysis,
  analyzing,
  onAnalyze,
  hasData,
  hasPrev,
}: {
  analysis: Analysis | null;
  analyzing: boolean;
  onAnalyze: () => void;
  hasData: boolean;
  hasPrev: boolean;
}) {
  return (
    <div className="rounded-2xl border border-violet-200/70 bg-violet-50/30 p-4 dark:border-violet-900/40 dark:bg-violet-950/10">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" /> Analyse &amp; décisions
        </h2>
        <button
          onClick={onAnalyze}
          disabled={analyzing || !hasData}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {analysis ? "Ré-analyser" : "Analyser"}
        </button>
      </div>

      {hasData && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          {hasPrev
            ? "Hygie analyse l'exercice et son évolution N vs N-1."
            : "Renseigne aussi l'exercice N-1 pour une analyse des tendances."}
        </p>
      )}

      {!hasData && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Renseigne d'abord quelques chiffres (import ou saisie) pour lancer l'analyse.
        </p>
      )}

      {analyzing && !analysis && (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Hygie étudie ton bilan…
        </p>
      )}

      {analysis && (
        <div className="mt-3 space-y-3">
          {analysis.synthese && (
            <p className="rounded-xl bg-card/70 p-3 text-[13px] leading-snug text-foreground">
              {analysis.synthese}
            </p>
          )}

          {analysis.forces.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Forces
              </p>
              <ul className="space-y-1">
                {analysis.forces.map((f, i) => (
                  <li key={i} className="text-[12.5px] text-foreground/85">• {f}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.vigilance.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Points de vigilance
              </p>
              <ul className="space-y-1">
                {analysis.vigilance.map((v, i) => (
                  <li key={i} className="text-[12.5px] text-foreground/85">• {v}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.recommandations.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                <Info className="h-3.5 w-3.5" /> Recommandations
              </p>
              <ul className="space-y-2">
                {analysis.recommandations.map((r, i) => (
                  <li key={i} className={cn("rounded-xl border p-3", PRIO_STYLE[r.priorite])}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{r.titre}</span>
                      <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", PRIO_BADGE[r.priorite])}>
                        {r.priorite}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                      {r.domaine}
                    </p>
                    {r.detail && <p className="mt-1 text-[12.5px] leading-snug text-foreground/80">{r.detail}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompareTable({ bilans }: { bilans: Bilan[] }) {
  // Compare les ratios clés de tous les bilans (colonnes = bilans).
  const cols = bilans.map((b) => ({ b, ratios: computeBilanRatios(b.data) }));
  const ratioKeys = cols[0]?.ratios.map((r) => ({ key: r.key, label: r.label })) ?? [];
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground">
            <th className="px-4 py-2 font-medium">Ratio</th>
            {cols.map(({ b }) => (
              <th key={b.id} className="px-3 py-2 text-right font-medium">
                {b.label}
                <span className="block text-[10px] font-normal text-muted-foreground/70">
                  {b.year} · {b.kind === "ESTIMATION" ? "estim." : "réel"}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ratioKeys.map((rk) => (
            <tr key={rk.key} className="border-t border-border/50">
              <td className="px-4 py-2 text-foreground/80">{rk.label}</td>
              {cols.map(({ b, ratios }) => {
                const r = ratios.find((x) => x.key === rk.key);
                return (
                  <td key={b.id} className={cn("px-3 py-2 text-right font-semibold tabular-nums", r ? RATIO_TONE[r.tone] : "")}>
                    {r?.value ?? "—"}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-border/50">
            <td className="px-4 py-2 font-medium text-foreground">Résultat net</td>
            {cols.map(({ b }) => (
              <td key={b.id} className="px-3 py-2 text-right tabular-nums">
                {typeof b.data.resultatNet === "number" ? eur(b.data.resultatNet) : "—"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
