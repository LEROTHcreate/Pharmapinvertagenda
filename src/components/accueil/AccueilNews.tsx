"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  Newspaper,
  PackageX,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import type { NewsItem } from "@/lib/pharmacy-news";
import { cn } from "@/lib/utils";

/**
 * Bloc « Actus » du tableau de bord — DEUX colonnes côte à côte pour limiter la
 * hauteur : à gauche l'actu pharmacie, à droite les ruptures & rappels. Chaque
 * colonne défile toute seule en continu (marquee) et se met en pause au survol.
 *
 * Défilement : on translate la liste (dupliquée) via `transform: translateY`
 * plutôt que via `scrollTop` — ce dernier était arrondi à l'entier par le
 * navigateur, donc l'incrément sous-pixel (~0,4 px/frame) restait bloqué à 0 et
 * rien ne bougeait. Le transform est sous-pixel → défilement réellement fluide.
 */
export function AccueilNews({
  news,
  alerts,
  className,
}: {
  news: NewsItem[];
  alerts: NewsItem[];
  className?: string;
}) {
  // Rien à afficher du tout → on masque le bloc entier.
  if (news.length === 0 && alerts.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      <NewsTicker
        title="Actus pharmacie"
        icon={<Newspaper className="h-4 w-4" />}
        tone="indigo"
        items={news}
      />
      <NewsTicker
        title="Ruptures & rappels"
        icon={<PackageX className="h-4 w-4" />}
        tone="rose"
        items={alerts}
      />
    </div>
  );
}

const TONE: Record<
  string,
  { badge: string; hoverText: string; dot: string }
> = {
  indigo: {
    badge: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
    hoverText: "group-hover:text-indigo-700 dark:group-hover:text-indigo-300",
    dot: "bg-indigo-400/80",
  },
  rose: {
    badge: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    hoverText: "group-hover:text-rose-700 dark:group-hover:text-rose-300",
    dot: "bg-rose-400/80",
  },
};

function NewsTicker({
  title,
  icon,
  tone,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  tone: keyof typeof TONE;
  items: NewsItem[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const pausedRef = useRef(false);
  // Décalage vertical courant (px), partagé entre l'animation auto et la molette.
  const offsetRef = useRef(0);
  const t = TONE[tone];

  // Marquee seulement s'il y a assez d'items pour boucler proprement.
  const animate = items.length >= 3;
  const loop = animate ? [...items, ...items] : items;

  useEffect(() => {
    if (!animate) return;
    const el = trackRef.current;
    const box = boxRef.current;
    if (!el || !box) return;

    let raf = 0;
    let last = 0;
    const SPEED = 24; // px / seconde (doux)

    const apply = () =>
      (el.style.transform = `translateY(${-offsetRef.current}px)`);

    const step = (now: number) => {
      if (last === 0) last = now;
      const dt = now - last;
      last = now;
      if (!pausedRef.current) {
        const half = el.scrollHeight / 2; // hauteur d'UN jeu (liste dupliquée)
        if (half > 0) {
          offsetRef.current += (SPEED * dt) / 1000;
          if (offsetRef.current >= half) offsetRef.current -= half; // boucle sans couture
          apply();
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    // Molette au survol → on fait défiler la liste (et non la page). Listener
    // natif non-passif pour pouvoir preventDefault. On enroule dans [0, half)
    // pour garder la boucle sans couture, quel que soit le sens.
    const onWheel = (e: WheelEvent) => {
      const half = el.scrollHeight / 2;
      if (half <= 0) return;
      e.preventDefault();
      const next = offsetRef.current + e.deltaY;
      offsetRef.current = ((next % half) + half) % half;
      apply();
    };
    box.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener("wheel", onWheel);
    };
  }, [animate, items.length]);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* En-tête */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
            t.badge
          )}
        >
          {icon}
        </span>
        <h2 className="truncate text-[12.5px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <Link
          href="/infos"
          aria-label={`Tout voir : ${title}`}
          className="ml-auto inline-flex shrink-0 items-center text-muted-foreground/60 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex h-[150px] items-center justify-center px-3 text-center text-[12px] text-muted-foreground">
          Rien à signaler pour le moment.
        </div>
      ) : (
        <div
          ref={boxRef}
          onMouseEnter={pause}
          onMouseLeave={resume}
          onTouchStart={pause}
          onTouchEnd={resume}
          className="relative h-[150px] overflow-hidden lg:h-[200px] [mask-image:linear-gradient(to_bottom,transparent,#000_9%,#000_91%,transparent)]"
        >
          <ul ref={trackRef} className="will-change-transform">
            {loop.map((n, i) => (
              <li key={`${n.link}-${i}`}>
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-2 px-3 py-2 transition-colors hover:bg-muted/40"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      t.dot
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "line-clamp-2 text-[12px] font-medium leading-snug text-foreground",
                        t.hoverText
                      )}
                    >
                      {n.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                      <span className="truncate">{n.source}</span>
                      {n.dateLabel && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="shrink-0 tabular-nums">
                            {n.dateLabel}
                          </span>
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
      )}
    </section>
  );
}
