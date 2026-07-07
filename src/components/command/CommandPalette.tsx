"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  Calendar,
  CalendarOff,
  MessageCircle,
  StickyNote,
  Lightbulb,
  Newspaper,
  LayoutTemplate,
  Users,
  BarChart3,
  Banknote,
  ShieldCheck,
  UserCog,
  Settings,
  User,
  Search,
  CornerDownLeft,
} from "lucide-react";
import type { UserRole } from "@prisma/client";
import { isAdminLevel, canEditPlanning } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Cmd = {
  label: string;
  href: string;
  icon: typeof Home;
  keywords?: string;
};

/** Normalise (minuscule, sans accents) pour un filtre tolérant. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Palette de commande (Ctrl/⌘ + K) — saut rapide vers n'importe quelle page,
 * au clavier. Autonome : un seul point de montage (layout dashboard). Les
 * destinations sont filtrées selon le rôle (mêmes règles que la nav).
 */
export function CommandPalette({
  userRole,
  canViewPayroll = false,
}: {
  userRole: UserRole;
  canViewPayroll?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = isAdminLevel(userRole);
  const isManager = canEditPlanning(userRole);

  const commands = useMemo<Cmd[]>(() => {
    const all: (Cmd & { show: boolean })[] = [
      { label: "Accueil", href: "/accueil", icon: Home, show: true },
      { label: "Planning", href: "/planning", icon: Calendar, show: true, keywords: "grille semaine" },
      { label: "Absences & dispos", href: "/absences", icon: CalendarOff, show: true, keywords: "conges disponibilites" },
      { label: "Messages", href: "/messages", icon: MessageCircle, show: true },
      { label: "Notes", href: "/notes", icon: StickyNote, show: true },
      { label: "Infos & conseils", href: "/infos", icon: Lightbulb, show: true },
      { label: "Actualités pharmacie", href: "/actualites", icon: Newspaper, show: true, keywords: "actu ruptures rappels news" },
      { label: "Mon profil", href: "/profil", icon: User, show: true, keywords: "agenda synchro mot de passe" },
      { label: "Gabarits", href: "/gabarits", icon: LayoutTemplate, show: isManager, keywords: "modele s1 s2 semaine type" },
      { label: "Équipe", href: "/employes", icon: Users, show: isManager, keywords: "collaborateurs employes" },
      { label: "Statistiques", href: "/stats", icon: BarChart3, show: isAdmin, keywords: "heures stats" },
      { label: "Rémunération", href: "/remuneration", icon: Banknote, show: canViewPayroll, keywords: "paie salaire" },
      { label: "Gardes", href: "/gardes", icon: ShieldCheck, show: isAdmin, keywords: "garde nuit dimanche" },
      { label: "Utilisateurs", href: "/utilisateurs", icon: UserCog, show: isAdmin, keywords: "comptes roles acces" },
      { label: "Paramètres", href: "/parametres", icon: Settings, show: true, keywords: "reglages officine logo" },
    ];
    return all.filter((c) => c.show);
  }, [isAdmin, isManager, canViewPayroll]);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return commands;
    return commands.filter(
      (c) => norm(c.label).includes(q) || (c.keywords ? norm(c.keywords).includes(q) : false)
    );
  }, [commands, query]);

  // Raccourci global Ctrl/⌘+K pour ouvrir/fermer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // À l'ouverture : reset + focus.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // focus après le paint
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Garde l'index sélectionné dans les bornes des résultats.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[active];
      if (c) go(c.href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-label="Aller à…"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onKeyDown={onKeyDown}
      >
        {/* Champ de recherche */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Aller à une page…"
            className="h-12 w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            Échap
          </kbd>
        </div>

        {/* Résultats */}
        <ul className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              Aucune page ne correspond.
            </li>
          ) : (
            results.map((c, i) => {
              const Icon = c.icon;
              const isActive = i === active;
              return (
                <li key={c.href}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(c.href)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-violet-600 text-white" : "text-foreground hover:bg-muted/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        isActive ? "bg-white/20 text-white" : "bg-muted text-foreground/70"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-[13.5px] font-medium">{c.label}</span>
                    {isActive && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Pied */}
        <div className="flex items-center gap-3 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">↑</kbd>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">↓</kbd>
            naviguer
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">↵</kbd>
            ouvrir
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">Ctrl</kbd>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
