"use client";

import type { CSSProperties } from "react";

/**
 * Overlay plein écran "WOW v2" affiché ~1100 ms entre une connexion
 * réussie et la redirection vers /planning. Empile :
 *  - voile semi-transparent qui flou le background (success-veil)
 *  - flash radial blanc qui balaie depuis le centre (success-flash)
 *  - 3 anneaux concentriques émeraude qui pulsent (success-ring)
 *  - 18 confettis colorés qui tombent avec rotation (confetti)
 *  - 8 sparkles qui s'élèvent depuis le centre (sparkle-rise)
 *  - check vert qui pop avec rebond + rotate (animate-check-pop)
 *  - "Connecté ✨" texte en fade-up
 *
 * 100 % CSS — pas de lib externe. Toutes les positions/délais sont
 * pré-calculés au render (déterministes : pas de Math.random côté JSX
 * pour éviter les mismatchs SSR, mais ici l'overlay ne s'affiche que
 * côté client après le clic donc c'est safe).
 */

const CONFETTI_COLORS = [
  "#a855f7", // violet
  "#ec4899", // pink
  "#38bdf8", // sky
  "#fbbf24", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#6366f1", // indigo
  "#22d3ee", // cyan
];

/** 18 confettis répartis sur la largeur de l'écran avec drift latéral aléatoire */
const CONFETTIS = Array.from({ length: 18 }, (_, i) => {
  const startX = (i / 18) * 100; // % de la largeur
  const drift = (Math.random() - 0.5) * 200; // dérive ±100px
  const rotation = 360 + Math.random() * 720; // 1 à 3 tours
  const duration = 1100 + Math.random() * 400; // 1.1s à 1.5s
  const delay = Math.random() * 200; // staggered start
  return {
    left: `${startX}%`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    cx: `${drift}px`,
    cr: `${rotation}deg`,
    cd: `${duration}ms`,
    cdelay: `${delay}ms`,
  };
});

/** 8 sparkles qui s'élèvent en cercle autour du check */
const SPARKLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * 360) / 8;
  const distance = 90 + Math.random() * 30;
  const rad = (angle * Math.PI) / 180;
  return {
    rx: `${Math.cos(rad) * distance}px`,
    ry: `${Math.sin(rad) * distance - 20}px`, // léger biais vers le haut
    sdelay: `${200 + i * 40}ms`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  };
});

export function LoginSuccessOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="success-veil fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-white/40"
    >
      {/* Flash radial qui balaie depuis le centre */}
      <span aria-hidden className="success-flash" />

      {/* Confettis qui tombent depuis le haut */}
      {CONFETTIS.map((c, i) => (
        <span
          key={`confetti-${i}`}
          aria-hidden
          className="confetti rounded-sm"
          style={
            {
              left: c.left,
              backgroundColor: c.color,
              "--cx": c.cx,
              "--cr": c.cr,
              "--cd": c.cd,
              "--cdelay": c.cdelay,
            } as CSSProperties
          }
        />
      ))}

      <div className="relative flex flex-col items-center gap-4">
        {/* Sparkles qui s'élèvent depuis le centre du check */}
        <div className="pointer-events-none absolute left-1/2 top-12 h-0 w-0">
          {SPARKLES.map((s, i) => (
            <span
              key={`sparkle-${i}`}
              aria-hidden
              className="sparkle-rise"
              style={
                {
                  color: s.color,
                  "--rx": s.rx,
                  "--ry": s.ry,
                  "--sdelay": s.sdelay,
                } as CSSProperties
              }
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
                <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
              </svg>
            </span>
          ))}
        </div>

        {/* 3 anneaux qui se propagent depuis le centre */}
        <div className="relative flex h-24 w-24 items-center justify-center text-emerald-500">
          <span aria-hidden className="success-ring success-ring--1 inset-0" />
          <span aria-hidden className="success-ring success-ring--2 inset-0" />
          <span aria-hidden className="success-ring success-ring--3 inset-0" />

          {/* Disque central — check qui pop avec rebond */}
          <div className="animate-check-pop relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_12px_40px_-6px_rgba(16,185,129,0.7),0_0_0_8px_rgba(16,185,129,0.12)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 drop-shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
              aria-hidden
            >
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          </div>
        </div>

        {/* Texte sous l'animation */}
        <p className="animate-fade-up text-[16px] font-semibold tracking-tight text-zinc-900 [animation-delay:400ms] [animation-fill-mode:both] opacity-0">
          Connecté ✨
        </p>
      </div>
    </div>
  );
}
