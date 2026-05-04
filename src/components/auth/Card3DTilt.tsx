"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Wrapper qui ajoute un léger tilt 3D sur la souris (façon Apple Vision /
 * marketing landing pages). Désactivé sur les devices tactiles (pas de
 * mousemove utile, et risque de gêner le scroll) et avec `prefers-reduced-motion`.
 */
export function Card3DTilt({
  children,
  /** Inclinaison max en degrés (X et Y). Plus = plus marqué. */
  max = 6,
  className,
}: {
  children: ReactNode;
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function handleMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Position relative à la card (-0.5 → +0.5)
    const cx = (e.clientX - r.left) / r.width - 0.5;
    const cy = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -cy * max, y: cx * max });
  }
  function handleLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{
        transform: `perspective(1100px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        // Lerp doux pour suivre le curseur sans saccades
        transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
      // Désactive le tilt sur mobile (pas de souris) et reduced-motion
      className={cn(
        "motion-reduce:!transform-none [@media(pointer:coarse)]:!transform-none",
        className
      )}
    >
      {children}
    </div>
  );
}
