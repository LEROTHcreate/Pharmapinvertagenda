"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, HelpCircle, Mail, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SAV_EMAIL = "notifications.thor@gmail.com";
const SUBJECT = "PharmaPlanning — Question / SAV";
const BODY =
  "Bonjour,\n\nJe vous contacte concernant PharmaPlanning :\n\n— Décrivez votre question ou votre demande ici.\n\nMerci par avance,";

/**
 * Bulle SAV flottante affichée en bas à droite de la landing page.
 * - Fermée : bouton circulaire avec icône d'aide + halo pulsé
 * - Ouverte : petit panneau au-dessus avec email + bouton "Envoyer" (mailto)
 *   et bouton "Copier l'adresse" (Clipboard API + fallback discret)
 * - Se ferme au clic extérieur, à Échap, ou via le X
 */
export function SavBubble() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Fermeture : clic extérieur + touche Échap
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(SAV_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Navigateur sans Clipboard API : pas grave, mailto reste l'option principale
    }
  }

  const mailto = `mailto:${SAV_EMAIL}?subject=${encodeURIComponent(
    SUBJECT
  )}&body=${encodeURIComponent(BODY)}`;

  return (
    <div
      ref={wrapRef}
      className="safe-bottom fixed right-5 sm:right-6 z-50 flex flex-col items-end gap-3"
    >
      {/* ─── Panneau ouvert ─────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="Contacter le support"
          className="animate-fade-up w-[88vw] max-w-[320px] origin-bottom-right rounded-2xl border border-zinc-200/70 bg-white/95 shadow-[0_20px_50px_-15px_rgba(76,29,149,0.35),0_8px_20px_-10px_rgba(76,29,149,0.18)] backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3">
            <div>
              <p className="text-[14px] font-semibold tracking-tight text-zinc-900">
                Une question&nbsp;? 👋
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500">
                On vous répond rapidement.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="rounded-full p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-zinc-200/70">
              <Mail className="h-4 w-4 text-violet-500 shrink-0" />
              <span className="flex-1 truncate font-mono text-[12.5px] text-zinc-700">
                {SAV_EMAIL}
              </span>
              <button
                type="button"
                onClick={copyEmail}
                aria-label="Copier l'adresse email"
                className={cn(
                  "shrink-0 rounded-md p-1 transition",
                  copied
                    ? "bg-emerald-50 text-emerald-600"
                    : "text-zinc-400 hover:bg-white hover:text-zinc-700"
                )}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <a
              href={mailto}
              className="group flex h-10 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-[13.5px] font-medium text-white shadow-md shadow-violet-600/25 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-600/35 active:translate-y-0"
            >
              <Mail className="h-4 w-4" />
              Envoyer un email
            </a>

            <p className="text-center text-[11px] text-zinc-400">
              Réponse sous 24h ouvrées
            </p>
          </div>
        </div>
      )}

      {/* ─── Bouton bulle ───────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer le panneau d'aide" : "Besoin d'aide ?"}
        aria-expanded={open}
        className={cn(
          "group relative flex h-13 w-13 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300",
          "bg-gradient-to-br from-violet-600 to-indigo-600 shadow-violet-600/35",
          "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-600/45",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        )}
        style={{ width: "52px", height: "52px" }}
      >
        {/* Halo pulsé (state fermé uniquement) */}
        {!open && (
          <span
            aria-hidden
            className="absolute inset-0 -z-10 animate-ping rounded-full bg-violet-500/40"
            style={{ animationDuration: "2.4s" }}
          />
        )}
        <span
          className={cn(
            "transition-transform duration-300",
            open && "rotate-90"
          )}
        >
          {open ? (
            <X className="h-5 w-5" strokeWidth={2.25} />
          ) : (
            <HelpCircle className="h-5 w-5" strokeWidth={2.25} />
          )}
        </span>
      </button>
    </div>
  );
}
