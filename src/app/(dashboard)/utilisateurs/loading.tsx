export default function UtilisateursLoading() {
  return (
    <div className="max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="animate-pulse space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="h-7 w-44 rounded-md bg-zinc-200/80" />
          <div className="h-4 w-80 rounded-md bg-zinc-200/60" />
        </div>

        {/* Section "demandes en attente" */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-300/70" />
            <div className="h-4 w-40 rounded bg-zinc-200/70" />
          </div>
          <div className="h-32 rounded-2xl bg-muted/80 ring-1 ring-inset ring-zinc-200/60" />
        </div>

        {/* Section "membres" */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-300/70" />
            <div className="h-4 w-24 rounded bg-zinc-200/70" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-xl bg-muted/80 ring-1 ring-inset ring-zinc-200/60"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
