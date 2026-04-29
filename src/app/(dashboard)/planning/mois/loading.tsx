export default function MonthOverviewLoading() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="animate-pulse space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 rounded-md bg-zinc-200/80" />
            <div className="h-4 w-40 rounded-md bg-zinc-200/60" />
          </div>
          <div className="h-9 w-72 rounded-full bg-zinc-200/60" />
        </div>

        {/* Heatmap */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white">
          <div
            className="grid border-b border-zinc-200/70 bg-zinc-50/70"
            style={{ gridTemplateColumns: "220px repeat(31, 28px) 90px" }}
          >
            {Array.from({ length: 33 }).map((_, i) => (
              <div key={i} className="h-12 border-r border-zinc-200/40 last:border-r-0" />
            ))}
          </div>
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="grid border-b border-zinc-100 last:border-b-0"
              style={{ gridTemplateColumns: "220px repeat(31, 28px) 90px" }}
            >
              <div className="h-10 border-r border-zinc-200/40 px-4 py-2">
                <div className="h-3 w-2/3 rounded bg-zinc-100" />
              </div>
              {Array.from({ length: 31 }).map((__, j) => (
                <div
                  key={j}
                  className="h-10 border-r border-zinc-100 last:border-r-0 bg-zinc-50/50"
                />
              ))}
              <div className="h-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
