export default function AuthLoading() {
  return (
    <div className="w-full max-w-[420px]">
      <div className="rounded-[28px] border border-white/60 bg-white/70 px-8 py-10 shadow-[0_30px_80px_-20px_rgba(76,29,149,0.25)] backdrop-blur-2xl sm:px-10 sm:py-12">
        <div className="animate-pulse space-y-6">
          <div className="mx-auto h-[72px] w-[72px] rounded-2xl bg-zinc-200/70" />
          <div className="space-y-2 text-center">
            <div className="mx-auto h-6 w-56 rounded-md bg-zinc-200/70" />
            <div className="mx-auto h-4 w-72 rounded-md bg-zinc-200/50" />
          </div>
          <div className="space-y-3">
            <div className="h-14 rounded-2xl bg-zinc-200/40" />
            <div className="h-14 rounded-2xl bg-zinc-200/40" />
            <div className="h-12 rounded-full bg-zinc-200/60" />
          </div>
        </div>
      </div>
    </div>
  );
}
