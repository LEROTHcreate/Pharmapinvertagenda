"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Newspaper, ExternalLink, ChevronRight } from "lucide-react";
import type { NewsItem } from "@/lib/pharmacy-news";
import { cn } from "@/lib/utils";

/**
 * Barre latérale « Actus » du tableau de bord — dernières infos pharmacie qui
 * défilent verticalement en continu. Chaque item est cliquable (article externe).
 *
 * Défilement : conteneur RÉELLEMENT scrollable + auto-scroll JS (requestAnim).
 * Au survol (ou au toucher) l'auto-scroll se met en pause → l'utilisateur peut
 * alors faire défiler la liste À LA MOLETTE (haut/bas), puis ça reprend tout
 * seul. Boucle continue grâce à la liste dupliquée (reset à la moitié).
 */
export function AccueilNews({
  items,
  className,
}: {
  items: NewsItem[];
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  const animate = items.length >= 4;
  const loop = animate ? [...items, ...items] : items;

  useEffect(() => {
    if (!animate) return;
    const el = scrollRef.current;
    if (!el) return;

    let raf = 0;
    let last = 0;
    const SPEED = 22; // px / seconde (défilement doux)

    const step = (now: number) => {
      if (last === 0) last = now;
      const dt = now - last;
      last = now;
      // Auto-scroll uniquement si non-pausé ET si le contenu déborde.
      if (!pausedRef.current && el.scrollHeight > el.clientHeight + 1) {
        el.scrollTop += (SPEED * dt) / 1000;
        const half = el.scrollHeight / 2;
        if (el.scrollTop >= half) el.scrollTop -= half; // boucle sans couture
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animate, items.length]);

  if (items.length === 0) return null;

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
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

      {/* Zone scrollable (molette au survol) + fondu haut/bas.
          Barre de défilement masquée pour l'esthétique, mais le scroll molette
          reste actif. */}
      <div
        ref={scrollRef}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={resume}
        onTouchStart={pause}
        onTouchEnd={resume}
        className="relative h-[240px] overflow-y-auto overscroll-contain lg:h-[360px] [mask-image:linear-gradient(to_bottom,transparent,#000_10%,#000_90%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul>
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
    </section>
  );
}
