"use client";

import Link from "next/link";
import { Newspaper, ExternalLink, ChevronRight } from "lucide-react";
import type { NewsItem } from "@/lib/pharmacy-news";
import { cn } from "@/lib/utils";

/**
 * Barre latérale « Actus » du tableau de bord — dernières infos pharmacie qui
 * défilent verticalement en continu (pause au survol / focus clavier). Chaque
 * item est cliquable (article externe, nouvel onglet) ; en-tête vers /infos
 * pour le détail complet.
 *
 * Le défilement est une simple animation CSS (translateY 0 → −50 % sur une
 * liste dupliquée = boucle continue), désactivée s'il y a trop peu d'items.
 */
export function AccueilNews({
  items,
  className,
}: {
  items: NewsItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  const animate = items.length >= 4;
  // Vitesse constante : ~5 s par item (aller simple sur la moitié dupliquée).
  const duration = Math.max(24, items.length * 5);
  const loop = animate ? [...items, ...items] : items;

  return (
    <section
      className={cn(
        "accueil-news flex flex-col rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        className
      )}
    >
      {/* En-tête */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          <Newspaper className="h-4 w-4" />
        </span>
        <h2 className="text-[13.5px] font-semibold tracking-tight text-foreground">
          Actus pharmacie
        </h2>
        <Link
          href="/actualites"
          className="ml-auto inline-flex items-center gap-0.5 text-[12px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
        >
          Tout voir <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Zone défilante (masque en fondu haut/bas) */}
      <div className="relative h-[240px] overflow-hidden lg:h-[360px] [mask-image:linear-gradient(to_bottom,transparent,#000_10%,#000_90%,transparent)]">
        <ul
          className={cn("accueil-news-track", animate && "will-change-transform")}
          style={
            animate
              ? {
                  animationName: "accueil-news-scroll",
                  animationDuration: `${duration}s`,
                  animationTimingFunction: "linear",
                  animationIterationCount: "infinite",
                }
              : undefined
          }
        >
          {loop.map((n, i) => (
            <li key={`${n.link}-${i}`}>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-2.5 px-4 py-2.5 transition-colors hover:bg-muted/40"
              >
                <span
                  aria-hidden
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/80"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground group-hover:text-rose-700 dark:group-hover:text-rose-300">
                    {n.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="truncate">{n.source}</span>
                    {n.dateLabel && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="shrink-0 tabular-nums">{n.dateLabel}</span>
                      </>
                    )}
                    <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Animation + pause au survol / focus (défilement des actus). */}
      <style>{`
        @keyframes accueil-news-scroll { to { transform: translateY(-50%); } }
        .accueil-news:hover .accueil-news-track,
        .accueil-news:focus-within .accueil-news-track { animation-play-state: paused; }
      `}</style>
    </section>
  );
}
