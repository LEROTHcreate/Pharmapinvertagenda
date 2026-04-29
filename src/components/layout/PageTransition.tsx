"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Fait un fade-up subtil à chaque changement de route.
 * Utilise pathname comme key pour forcer un remount du wrapper et
 * re-jouer l'animation CSS `page-transition`.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
