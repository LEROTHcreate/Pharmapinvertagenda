/**
 * Squelette de la grille planning — formes proches du rendu final
 * pour éviter le "saut" visuel à la fin du chargement.
 */
export default function PlanningLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="animate-pulse space-y-5">
        {/* Barre de navigation semaine */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-zinc-200/70" />
            <div className="h-9 w-48 rounded-md bg-zinc-200/80" />
            <div className="h-9 w-9 rounded-md bg-zinc-200/70" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-md bg-zinc-200/60" />
            <div className="h-9 w-24 rounded-md bg-zinc-200/50" />
          </div>
        </div>

        {/* Onglets jours */}
        <div className="flex gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-16 rounded-md bg-zinc-200/60" />
          ))}
        </div>

        {/* Grille (lignes horaires) */}
        <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-white">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[64px_repeat(8,1fr)] border-b border-zinc-100 last:border-b-0"
            >
              <div className="border-r border-zinc-100 bg-zinc-50/60 p-2">
                <div className="h-3 w-10 rounded bg-zinc-200/70" />
              </div>
              {Array.from({ length: 8 }).map((__, j) => (
                <div key={j} className="border-r border-zinc-100 p-2 last:border-r-0">
                  <div className="h-6 w-full rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
