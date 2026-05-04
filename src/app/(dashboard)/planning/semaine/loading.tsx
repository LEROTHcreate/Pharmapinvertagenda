export default function WeekOverviewLoading() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="animate-pulse space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 w-44 rounded-md bg-zinc-200/80" />
            <div className="h-4 w-64 rounded-md bg-zinc-200/60" />
          </div>
          <div className="h-9 w-72 rounded-full bg-zinc-200/60" />
        </div>

        {/* Tableau */}
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="grid grid-cols-[220px_repeat(6,1fr)_90px] border-b border-border/70 bg-muted/40/70">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 border-r border-border/50 last:border-r-0" />
            ))}
          </div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[220px_repeat(6,1fr)_90px] border-b border-border/60 last:border-b-0"
            >
              {Array.from({ length: 8 }).map((__, j) => (
                <div
                  key={j}
                  className="h-16 border-r border-border/60 p-2 last:border-r-0"
                >
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
