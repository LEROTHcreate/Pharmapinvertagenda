"use client";

import { useState } from "react";
import { CalendarDays, Check, Copy, Loader2, Link2, Power } from "lucide-react";
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

  const feedUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/api/ical/${token}`
      : null;

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
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Dans Google Agenda : « Autres agendas » → « À partir de l&apos;URL » →
            colle ce lien. Garde-le secret : il donne accès à ton planning.
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
