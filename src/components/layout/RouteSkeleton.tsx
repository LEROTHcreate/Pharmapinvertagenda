/**
 * Squelette de chargement générique d'une page du dashboard. Rendu par les
 * `loading.tsx` de chaque route → au clic sur un onglet, Next affiche
 * INSTANTANÉMENT cet écran (frontière Suspense) pendant que le server component
 * (force-dynamic) rend côté serveur. Sans ça, la page précédente reste figée
 * le temps du round-trip → sensation de lag à la navigation.
 *
 * Le layout (sidebar/tab bar) reste monté : ce squelette ne remplit que la
 * zone de contenu. Tokens de thème (bg-muted) → compatible dark mode.
 */
export function RouteSkeleton() {
  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-4 lg:p-6">
      <div className="animate-pulse space-y-5">
        {/* En-tête */}
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-md bg-muted" />
          <div className="h-4 w-72 max-w-full rounded-md bg-muted/60" />
        </div>
        {/* Blocs de contenu */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-muted/70 ring-1 ring-inset ring-border/60"
          />
        ))}
      </div>
    </div>
  );
}
