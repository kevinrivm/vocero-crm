/**
 * Respuesta inmediata al navegar entre pantallas autenticadas.
 * Next puede previsualizar este límite aunque la página final sea dinámica,
 * y deja el shell de la aplicación interactivo mientras llega el contenido.
 */
export default function AppLoading() {
  return (
    <section className="flex h-full min-h-0 flex-col" role="status" aria-busy="true">
      <span className="sr-only">Cargando pantalla…</span>

      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="h-5 w-28 animate-pulse rounded bg-secondary" />
        <div className="h-8 w-32 animate-pulse rounded bg-secondary" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="h-4 w-44 animate-pulse rounded bg-secondary" />
          <div className="h-9 w-40 animate-pulse rounded bg-secondary" />
        </div>

        <div className="overflow-hidden rounded-md border bg-card">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b px-4 py-4 last:border-b-0"
            >
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-secondary" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-1/3 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
              </div>
              <div className="hidden h-6 w-20 animate-pulse rounded bg-secondary sm:block" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
