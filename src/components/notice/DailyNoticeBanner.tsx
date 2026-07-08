"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Pin, X, Pencil, Trash2, Check, Loader2, Plus } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { isAdminLevel } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "pp_notice_dismissed_at";

type Notice = { text: string | null; at: string | null };

/**
 * Mémo du jour / consigne d'officine — un responsable pose une note courte
 * (« livraison Boiron 14h », « promo dentifrice »), toute l'équipe la voit.
 *
 * Deux emplacements :
 *  - `compact` (dans le bandeau d'accueil du /planning) : une pastille en ligne,
 *    entre le message d'accueil et l'ampoule, pour gagner de la hauteur.
 *  - global (monté dans le layout, toutes les autres pages) : bandeau pleine
 *    largeur. Masqué sur /planning puisque la version compacte y prend le relais.
 *
 * Autonome : fetch /api/notice, édition inline (admin), rejet mémorisé par
 * utilisateur (clé = horodatage de la consigne → une NOUVELLE consigne
 * ré-apparaît même si l'ancienne avait été masquée).
 */
export function DailyNoticeBanner({
  userRole,
  compact = false,
}: {
  userRole: UserRole;
  compact?: boolean;
}) {
  const isAdmin = isAdminLevel(userRole);
  const pathname = usePathname();
  const onPlanning = pathname?.startsWith("/planning") ?? false;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDismissedAt(
      typeof window !== "undefined" ? window.localStorage.getItem(DISMISS_KEY) : null
    );
    let cancelled = false;
    fetch("/api/notice")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setNotice({ text: d.text ?? null, at: d.at ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const hasNotice = !!notice?.text;
  const dismissed = hasNotice && notice?.at != null && notice.at === dismissedAt;

  function dismiss() {
    if (notice?.at) {
      window.localStorage.setItem(DISMISS_KEY, notice.at);
      setDismissedAt(notice.at);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/notice", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotice({ text: d.text ?? null, at: d.at ?? null });
        setEditing(false);
        // l'auteur voit sa consigne (pas de rejet auto)
        if (d.at) {
          window.localStorage.setItem(DISMISS_KEY, "");
          setDismissedAt("");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function clearNotice() {
    setBusy(true);
    try {
      const res = await fetch("/api/notice", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      if (res.ok) setNotice({ text: null, at: null });
    } finally {
      setBusy(false);
    }
  }

  // Le bandeau GLOBAL (layout) se masque sur /planning : la pastille compacte du
  // bandeau d'accueil y prend le relais. Symétriquement, la version compacte ne
  // s'affiche QUE sur /planning.
  if (!compact && onPlanning) return null;
  if (compact && !onPlanning) return null;

  // ─── Mode édition (admin) ────────────────────────────────────────
  if (editing) {
    // Compact : éditeur en ligne (une seule ligne) pour ne pas gonfler la hauteur.
    if (compact) {
      return (
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={280}
            autoFocus
            placeholder="Consigne du jour…"
            className="h-8 w-[min(48vw,240px)] rounded-lg border border-amber-300 bg-card px-2.5 text-[12.5px] outline-none focus:border-amber-400 dark:border-amber-800"
          />
          <button
            onClick={save}
            disabled={busy}
            title="Publier"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => setEditing(false)}
            title="Annuler"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }
    return (
      <div className="mb-3 rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 dark:border-amber-800/60 dark:bg-amber-950/20">
        <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          <Pin className="h-3.5 w-3.5" /> Consigne du jour
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={280}
          rows={2}
          autoFocus
          placeholder="Ex. Livraison Boiron 14h · promo dentifrice cette semaine…"
          className="w-full resize-none rounded-lg border border-amber-200 bg-card px-3 py-2 text-[13.5px] outline-none focus:border-amber-400 dark:border-amber-900/60"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Publier
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/50"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  // ─── Consigne active ─────────────────────────────────────────────
  if (hasNotice && !dismissed) {
    // Compact : pastille en ligne (texte tronqué), pour le bandeau d'accueil.
    if (compact) {
      return (
        <div className="flex min-w-0 items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50/70 py-1 pl-2.5 pr-1.5 dark:border-amber-800/60 dark:bg-amber-950/20">
          <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
          <span
            className="truncate text-[12px] font-medium text-amber-900 dark:text-amber-100"
            title={notice!.text ?? ""}
          >
            {notice!.text}
          </span>
          {isAdmin && (
            <>
              <button
                onClick={() => {
                  setDraft(notice?.text ?? "");
                  setEditing(true);
                }}
                title="Modifier la consigne"
                className="shrink-0 rounded p-1 text-amber-700/70 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-900/40"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={clearNotice}
                disabled={busy}
                title="Effacer la consigne"
                className="shrink-0 rounded p-1 text-amber-700/70 hover:bg-amber-100 hover:text-amber-800 disabled:opacity-60 dark:hover:bg-amber-900/40"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          <button
            onClick={dismiss}
            title="Masquer"
            className="shrink-0 rounded p-1 text-amber-700/60 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-900/40"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      );
    }
    return (
      <div className="mb-3 flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50/60 px-3.5 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/20">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          <Pin className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">
            Consigne du jour
          </p>
          <p className="whitespace-pre-wrap text-[13.5px] leading-snug text-amber-900 dark:text-amber-100">
            {notice!.text}
          </p>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => {
                setDraft(notice?.text ?? "");
                setEditing(true);
              }}
              title="Modifier"
              className="rounded-md p-1.5 text-amber-700/70 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-900/40"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={clearNotice}
              disabled={busy}
              title="Effacer la consigne"
              className="rounded-md p-1.5 text-amber-700/70 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-900/40 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <button
          onClick={dismiss}
          title="Masquer"
          className="shrink-0 rounded-md p-1.5 text-amber-700/60 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-900/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ─── Aucune consigne : bouton discret pour l'admin ───────────────
  if (isAdmin && !hasNotice) {
    return (
      <button
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-dashed border-border font-medium text-muted-foreground transition-colors hover:border-amber-300 hover:text-amber-700 dark:hover:text-amber-300",
          compact ? "px-2.5 py-1 text-[11.5px]" : "mb-3 px-3 py-1.5 text-[12px]"
        )}
        title="Ajouter une consigne du jour"
      >
        <Plus className="h-3.5 w-3.5" />
        {compact ? "Consigne du jour" : "Ajouter une consigne du jour"}
      </button>
    );
  }

  return null;
}
