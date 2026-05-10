"use client";

import type { CSSProperties } from "react";

/**
 * Overlay de succès — affiché ~1100 ms entre une connexion réussie et la
 * redirection vers /planning. Positionné EN ABSOLU dans la card de login
 * (pas plein écran) pour ne plus laisser apparaître le formulaire derrière
 * un voile semi-transparent. La card devient elle-même le panneau de succès.
 *
 * Empile :
 *  - fond gradient violet → emerald solide qui masque le formulaire
 *  - 14 confettis colorés qui retombent à l'intérieur de la card
 *  - 3 anneaux émeraude qui pulsent depuis le centre
 *  - 8 sparkles qui s'élèvent en cercle autour du check
 *  - check vert qui pop avec rebond + halo glow
 *  - "Connecté !" en fade-up + sous-titre "Redirection en cours…"
 *
 * 100 % CSS — pas de lib externe.
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

/** 14 confettis répartis sur la largeur de la card avec drift latéral */
const CONFETTIS = Array.from({ length: 14 }, (_, i) => {
  const startX = ((i + 0.5) / 14) * 100; // % de la largeur
  const drift = (Math.random() - 0.5) * 80; // dérive ±40px (contenu carte)
  const rotation = 360 + Math.random() * 540;
  const duration = 1000 + Math.random() * 350;
  const delay = Math.random() * 250;
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
  const distance = 70 + Math.random() * 25;
  const rad = (angle * Math.PI) / 180;
  return {
    rx: `${Math.cos(rad) * distance}px`,
    ry: `${Math.sin(rad) * distance - 16}px`,
    sdelay: `${200 + i * 35}ms`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  };
});

export function LoginSuccessOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="success-card-veil absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden rounded-[28px]"
    >
      {/* Confettis qui retombent à l'intérieur de la card */}
      {CONFETTIS.map((c, i) => (
        <span
          key={`confetti-${i}`}
          aria-hidden
          className="confetti-card rounded-sm"
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

      <div className="relative flex flex-col items-center gap-5">
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
          <div className="animate-check-pop relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_18px_48px_-8px_rgba(16,185,129,0.65),0_0_0_10px_rgba(16,185,129,0.12)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 drop-shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
              aria-hidden
            >
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          </div>
        </div>

        {/* Texte sous l'animation */}
        <div className="text-center">
          <p className="animate-fade-up text-[20px] font-semibold tracking-tight text-zinc-900 [animation-delay:300ms] [animation-fill-mode:both] opacity-0">
            Connecté&nbsp;!
          </p>
          <p className="animate-fade-up mt-1 text-[13px] text-zinc-500 [animation-delay:500ms] [animation-fill-mode:both] opacity-0">
            Redirection en cours…
          </p>
        </div>
      </div>
    </div>
  );
}
