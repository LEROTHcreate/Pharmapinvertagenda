import type { ReactNode } from "react";

/**
 * Conteneur de contenu du dashboard.
 *
 * ⚠️ Perf : on n'anime PLUS le contenu à chaque navigation. L'ancienne
 * version utilisait `key={pathname}` → elle remontait tout l'arbre de la page
 * ET rejouait une animation fade-up de 280 ms à CHAQUE changement de route,
 * ce qui rendait le passage entre les pages visiblement lent. Le layout du
 * dashboard reste monté d'une route à l'autre : un simple passthrough donne
 * une navigation instantanée.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
