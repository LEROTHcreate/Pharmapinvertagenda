"use client";

import { useEffect, useState } from "react";
import {
  Monitor,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  WEEKDAY_LABELS,
  formatDayRanges,
  type HourRange,
  type WeekHours,
} from "@/lib/opening-hours";

/**
 * Réglages de l'écran vitrine (page Paramètres) :
 *  - le lien public à copier / ouvrir sur l'écran de salle d'attente ;
 *  - l'éditeur des horaires d'ouverture (titulaires uniquement).
 */
export function VitrineSettings({
  vitrinePath,
  initialHours,
  canEdit,
}: {
  vitrinePath: string;
  initialHours: WeekHours;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [hours, setHours] = useState<WeekHours>(initialHours);
  const [fullUrl, setFullUrl] = useState(vitrinePath);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullUrl(`${window.location.origin}${vitrinePath}`);
  }, [vitrinePath]);

  function mutateDay(day: number, next: HourRange[]) {
    setHours((prev) => prev.map((d, i) => (i === day ? next : d)));
  }

  function addRange(day: number) {
    const existing = hours[day];
    const last = existing[existing.length - 1];
    // Propose un créneau après le dernier (matin → après-midi), sinon 09:00.
    const start = last ? last.close : "09:00";
    mutateDay(day, [...existing, { open: start, close: "19:00" }]);
  }

  function updateRange(
    day: number,
    idx: number,
    field: "open" | "close",
    value: string
  ) {
    mutateDay(
      day,
      hours[day].map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  function removeRange(day: number, idx: number) {
    mutateDay(
      day,
      hours[day].filter((_, i) => i !== idx)
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/pharmacy/vitrine", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ openingHours: hours }),
      });
      if (!res.ok) throw new Error();
      toast({ tone: "success", title: "Horaires enregistrés" });
    } catch {
      toast({ tone: "error", title: "Échec de l'enregistrement" });
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ tone: "error", title: "Copie impossible" });
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5 space-y-5">
      <header className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          <Monitor className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">
            Écran vitrine / salle d&apos;attente
          </h2>
          <p className="text-[12.5px] text-muted-foreground">
            Une page plein écran (garde, horaires, message du jour) à afficher
            sur un écran de l&apos;officine.
          </p>
        </div>
      </header>

      {/* Lien public */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-muted-foreground">
          Lien de l&apos;écran (aucune connexion requise)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={fullUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[12px] text-foreground"
          />
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium transition-colors hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copié" : "Copier"}
          </button>
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-violet-700"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir l&apos;écran
          </a>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          Astuce : ouvrez ce lien en plein écran (F11) sur la tablette / TV de la
          salle d&apos;attente. Il se met à jour tout seul.
        </p>
      </div>

      {/* Horaires */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-muted-foreground">
          Horaires d&apos;ouverture
        </p>

        {!canEdit ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {WEEKDAY_LABELS.map((label, i) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
              >
                <span className="text-muted-foreground">{label}</span>
                <span
                  className={
                    hours[i].length === 0
                      ? "text-muted-foreground/50"
                      : "font-medium tabular-nums"
                  }
                >
                  {formatDayRanges(hours[i])}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <div className="space-y-2">
              {WEEKDAY_LABELS.map((label, day) => (
                <div
                  key={label}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="w-20 shrink-0 text-[13px] font-medium">
                    {label}
                  </span>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {hours[day].length === 0 && (
                      <span className="text-[12.5px] text-muted-foreground/60">
                        Fermé
                      </span>
                    )}
                    {hours[day].map((r, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-1"
                      >
                        <input
                          type="time"
                          value={r.open}
                          onChange={(e) =>
                            updateRange(day, idx, "open", e.target.value)
                          }
                          className="rounded border border-border bg-background px-1 py-0.5 text-[12.5px] tabular-nums"
                        />
                        <span className="text-muted-foreground">–</span>
                        <input
                          type="time"
                          value={r.close}
                          onChange={(e) =>
                            updateRange(day, idx, "close", e.target.value)
                          }
                          className="rounded border border-border bg-background px-1 py-0.5 text-[12.5px] tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => removeRange(day, idx)}
                          aria-label="Retirer ce créneau"
                          className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addRange(day)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[12px] text-muted-foreground hover:border-violet-300 hover:text-violet-600"
                    >
                      <Plus className="h-3.5 w-3.5" /> Créneau
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? "Enregistrement…" : "Enregistrer les horaires"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
