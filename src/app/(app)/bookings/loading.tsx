export default function BookingsLoading() {
  return (
    <section className="flex h-full min-h-0 flex-col" role="status" aria-busy="true">
      <span className="sr-only">Cargando citas y horarios…</span>

      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="h-5 w-24 animate-pulse rounded bg-secondary" />
        <div className="h-8 w-44 animate-pulse rounded bg-secondary" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="h-4 w-40 animate-pulse rounded bg-secondary" />
          <div className="h-8 w-32 animate-pulse rounded bg-secondary" />
        </div>

        <div className="grid min-h-[360px] flex-1 grid-cols-4 overflow-hidden rounded-md border bg-border sm:grid-cols-7">
          {Array.from({ length: 7 }, (_, day) => (
            <div key={day} className="min-w-0 bg-card p-2 sm:p-3">
              <div className="h-3 w-10 animate-pulse rounded bg-secondary" />
              <div className="mt-2 h-4 w-7 animate-pulse rounded bg-secondary" />
              <div className="mt-7 h-12 animate-pulse rounded border-l-2 border-brand bg-brand-tint" />
              {day % 2 === 0 && (
                <div className="mt-4 h-9 animate-pulse rounded border-l-2 border-border-strong bg-subtle" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
