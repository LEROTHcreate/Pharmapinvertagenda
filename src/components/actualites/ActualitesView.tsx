"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Newspaper,
  AlertTriangle,
  Search,
  X,
  Loader2,
  ChevronRight,
} from "lucide-react";
import type { NewsItem } from "@/lib/pharmacy-news";
import { cn } from "@/lib/utils";

type Tab = "actu" | "alertes";

/**
 * Page « Actualités pharmacie » plein écran : deux rubriques (Actu pharmacie /
 * Ruptures & rappels) en onglets, plus une barre de recherche libre. La
 * recherche déclenche un round-trip serveur (?q=…) qui interroge le flux ;
 * chaque article ouvre sa source dans un nouvel onglet.
 */
export function ActualitesView({
  query,
  results,
  news,
  alerts,
  initialTab,
}: {
  query: string;
  results: NewsItem[];
  news: NewsItem[];
  alerts: NewsItem[];
  initialTab: Tab;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState(query);
  const [tab, setTab] = useState<Tab>(initialTab);

  const searching = query.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    startTransition(() => {
      router.push(q ? `/actualites?q=${encodeURIComponent(q)}` : "/actualites");
    });
  }

  function clearSearch() {
    setTerm("");
    startTransition(() => router.push("/actualites"));
  }

  const list = searching ? results : tab === "actu" ? news : alerts;

  return (
    <div className="w-full p-3 md:p-4 lg:p-6 pb-16">
      {/* En-tête */}
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          <Newspaper className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Actualités pharmacie
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            L&apos;actu de l&apos;officine et les ruptures / rappels — cherchez un
            sujet ou parcourez les rubriques.
          </p>
        </div>
      </header>

      {/* Barre de recherche */}
      <form onSubmit={submit} className="mb-5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Rechercher un sujet : rupture, vaccination, convention, DPC…"
            className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-9 text-[14px] text-foreground outline-none transition-colors focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-900/40"
          />
          {term && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Effacer"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-[14px] font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Rechercher
        </button>
      </form>

      {/* Onglets (masqués en mode recherche) */}
      {!searching && (
        <div className="mb-4 inline-flex items-center gap-1 rounded-xl bg-muted/60 p-1">
          <TabButton
            active={tab === "actu"}
            onClick={() => setTab("actu")}
            icon={<Newspaper className="h-3.5 w-3.5" />}
            label="Actu pharmacie"
            count={news.length}
          />
          <TabButton
            active={tab === "alertes"}
            onClick={() => setTab("alertes")}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Ruptures & rappels"
            count={alerts.length}
          />
        </div>
      )}

      {/* Bandeau résultats de recherche */}
      {searching && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {results.length}
            </span>{" "}
            résultat{results.length > 1 ? "s" : ""} pour «&nbsp;
            <span className="font-medium text-foreground">{query}</span>&nbsp;»
          </span>
          <button
            onClick={clearSearch}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium text-foreground/80 transition hover:bg-muted/70"
          >
            <X className="h-3 w-3" /> Effacer la recherche
          </button>
        </div>
      )}

      {/* Grille d'articles */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Search className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[14px] font-medium text-foreground">
            {searching ? "Aucun résultat" : "Rien à afficher pour le moment"}
          </p>
          <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
            {searching
              ? "Essayez d'autres mots-clés (ex. « paracétamol », « honoraires », « garde »)."
              : "Le flux d'actualité est momentanément indisponible — réessayez plus tard."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((n, i) => (
            <ArticleCard key={`${n.link}-${i}`} item={n} />
          ))}
        </ul>
      )}

      {/* Source */}
      <p className="mt-5 text-[11px] text-muted-foreground/70">
        Source : Google Actualités · titres et liens externes, mis à jour en
        continu · aucun contenu hébergé ici.
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[11px] tabular-nums",
          active ? "bg-muted text-foreground/70" : "text-muted-foreground/60"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ArticleCard({ item }: { item: NewsItem }) {
  return (
    <li>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-rose-300 dark:hover:border-rose-800"
      >
        <p className="line-clamp-3 text-[14px] font-medium leading-snug text-foreground group-hover:text-rose-700 dark:group-hover:text-rose-300">
          {item.title}
        </p>
        <div className="mt-auto flex items-center gap-1.5 pt-3 text-[11.5px] text-muted-foreground">
          <span className="truncate font-medium">{item.source}</span>
          {item.dateLabel && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 tabular-nums">{item.dateLabel}</span>
            </>
          )}
          <span className="ml-auto inline-flex items-center gap-0.5 text-rose-600/70 transition-transform group-hover:translate-x-0.5 dark:text-rose-400/70">
            Lire <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </a>
    </li>
  );
}
