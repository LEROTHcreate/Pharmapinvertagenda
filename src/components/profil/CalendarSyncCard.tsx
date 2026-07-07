"use client";

import { useState } from "react";
import {
  CalendarDays,
  Check,
  Copy,
  Loader2,
  Link2,
  Power,
  CalendarPlus,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Synchronisation du planning personnel dans un agenda externe (Google/Apple)
 * via un flux iCal privé. Le jeton est non devinable et révocable.
 */
export function CalendarSyncCard({ initialToken }: { initialToken: string | null }) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Options d'abonnement (intégrées dans l'URL).
  const [months, setMonths] = useState<1 | 2 | 3>(2);
  const [includePast, setIncludePast] = useState(true);
  const [includeAbsences, setIncludeAbsences] = useState(false);

  const query = (() => {
    const qs = new URLSearchParams();
    qs.set("months", String(months));
    if (!includePast) qs.set("past", "0");
    if (includeAbsences) qs.set("absences", "1");
    return qs.toString();
  })();

  const feedUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/api/ical/${token}?${query}`
      : null;
  // Schéma webcal:// → ouvre directement le dialogue d'abonnement sur
  // iPhone/Mac (Apple Calendrier) et la plupart des apps agenda.
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:/, "webcal:") : null;

  async function enable() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/ical", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        toast({ tone: "error", title: "Activation impossible" });
        return;
      }
      setToken(data.token);
      toast({ tone: "success", title: "Synchronisation activée", duration: 1800 });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/ical", { method: "DELETE" });
      if (!res.ok) {
        toast({ tone: "error", title: "Révocation impossible" });
        return;
      }
      setToken(null);
      toast({ tone: "info", title: "Synchronisation désactivée", duration: 1800 });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ tone: "error", title: "Copie impossible", description: "Copie l'URL manuellement." });
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/70 mb-1">
        Calendrier
      </p>
      <h2 className="text-base font-semibold tracking-tight text-foreground mb-1 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-violet-600" />
        Synchroniser mon planning
      </h2>
      <p className="text-[13px] text-muted-foreground mb-4">
        Abonne ton agenda (Google Agenda, Apple Calendrier…) à cette URL privée
        pour retrouver tes créneaux directement dans ton téléphone. L&apos;agenda
        se met à jour automatiquement.
      </p>

      {!token ? (
        <button
          onClick={enable}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Activer la synchronisation
        </button>
      ) : (
        <div className="space-y-3">
          {/* Réglages de l'abonnement (intégrés dans l'URL) */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="ical-months" className="text-[12.5px] font-medium text-foreground">
                Période à afficher
              </label>
              <select
                id="ical-months"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value) as 1 | 2 | 3)}
                className="rounded-md border border-input bg-background px-2 py-1 text-[12.5px]"
              >
                <option value={1}>1 mois à venir</option>
                <option value={2}>2 mois à venir</option>
                <option value={3}>3 mois à venir</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground/85">
              <input
                type="checkbox"
                checked={includePast}
                onChange={(e) => setIncludePast(e.target.checked)}
                className="h-4 w-4 accent-violet-600"
              />
              Inclure les 2 dernières semaines (historique)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground/85">
              <input
                type="checkbox"
                checked={includeAbsences}
                onChange={(e) => setIncludeAbsences(e.target.checked)}
                className="h-4 w-4 accent-violet-600"
              />
              Inclure mes absences (congés, maladie, formation)
            </label>
            <p className="text-[11px] text-muted-foreground">
              Choisis avant d&apos;ajouter. Pour changer ensuite, ré-ajoute le lien
              (bouton ou copie ci-dessous).
            </p>
          </div>

          {/* Ajout en 1 clic (iPhone / Mac / apps agenda gérant webcal://) */}
          {webcalUrl && (
            <a
              href={webcalUrl}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-violet-700"
            >
              <CalendarPlus className="h-4 w-4" />
              Ajouter à mon agenda
            </a>
          )}

          {/* URL manuelle (Google Agenda web, Android…) */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={feedUrl ?? "…"}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded-md border border-input bg-muted/40 px-2.5 py-1.5 text-[12px] font-mono text-foreground/80"
            />
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-accent/60"
              title="Copier l'URL"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>

          {/* Mini-guide par plateforme */}
          <ul className="space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground/80">iPhone / Mac :</span>{" "}
              touche « Ajouter à mon agenda » ci-dessus → confirme l&apos;abonnement.
            </li>
            <li>
              <span className="font-semibold text-foreground/80">Google Agenda :</span>{" "}
              sur ordinateur, « Autres agendas » → « À partir de l&apos;URL » → colle le lien
              (il se synchronise ensuite sur ton téléphone Android).
            </li>
            <li>
              <span className="font-semibold text-foreground/80">Android :</span>{" "}
              utilise Google Agenda ci-dessus, ou colle le lien dans ton appli calendrier.
            </li>
          </ul>
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Garde ce lien secret : il donne accès à ton planning.
          </p>

          <button
            onClick={disable}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1.5 text-[12.5px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            Désactiver / réinitialiser le lien
          </button>
        </div>
      )}
    </section>
  );
}
