/**
 * Squelette générique pour toutes les pages du dashboard.
 * S'affiche instantanément pendant que le RSC se charge — UX fluide.
 */
export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="animate-pulse space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="h-7 w-44 rounded-md bg-zinc-200/80" />
          <div className="h-4 w-72 rounded-md bg-zinc-200/60" />
        </div>

        {/* Bloc d'actions */}
        <div className="flex flex-wrap gap-2">
          <div className="h-9 w-32 rounded-full bg-zinc-200/70" />
          <div className="h-9 w-28 rounded-full bg-zinc-200/60" />
          <div className="h-9 w-24 rounded-full bg-zinc-200/50" />
        </div>

        {/* Cartes / lignes */}
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-zinc-100/80 ring-1 ring-inset ring-zinc-200/60"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
