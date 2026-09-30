export default function Loading() {
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10" aria-busy="true">
      <div className="h-8 w-64 rounded-lg bg-brand-bg animate-pulse mb-6" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-brand-border overflow-hidden bg-white">
            <div className="aspect-[5/3] bg-brand-bg animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 rounded bg-brand-bg animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-brand-bg animate-pulse" />
              <div className="h-5 w-1/3 rounded bg-brand-bg animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
