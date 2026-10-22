"use client";

import { systemText } from "@/lib/i18n";

import { useI18n } from "@/components/i18n-provider";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RateDto } from "@/lib/analytics";

/**
 * 019 — Contenedor de cada bloque de Resultados. Cada sección carga por su
 * cuenta: una lenta no retrasa a las demás y una rota no deja la pantalla en
 * blanco.
 *
 * Al cambiar el rango, lo anterior se queda a la vista atenuado hasta que
 * llega lo nuevo: vaciar la sección en cada cambio la haría saltar y
 * parpadear justo mientras el dueño compara.
 */
export function Section({
  title,
  hint,
  loading,
  error,
  hasData,
  empty,
  emptyText,
  right,
  children,
  id,
}: {
  title: string;
  hint?: string;
  loading: boolean;
  error?: string | null;
  /** Hay datos que pintar (aunque estén recargándose). */
  hasData: boolean;
  empty?: boolean;
  emptyText?: string;
  right?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const { t: tr } = useI18n();

  return (
    <section
      id={id}
      aria-busy={loading}
      className="rounded-lg border border-border-strong bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-text-3">{hint}</p>}
        </div>
        {right}
      </header>
      <div
        className={cn(
          "p-4 transition-opacity sm:p-5",
          loading && hasData && "opacity-60"
        )}
      >
        {error ? (
          <p className="py-6 text-center text-sm text-danger-text">{systemText(tr.locale, error)}</p>
        ) : !hasData ? (
          <p className="py-6 text-center text-sm text-text-3">{tr("Calculando…")}</p>
        ) : empty ? (
          <p className="py-6 text-center text-sm text-text-3">
            {emptyText ?? tr("No hay datos en este periodo.")}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/**
 * Una tasa NUNCA se muestra sola: siempre con el número que la sostiene, y
 * marcada cuando la muestra es chica.
 */
export function Rate({
  rate,
  unit = "casos",
  className,
}: {
  rate: RateDto;
  unit?: string;
  className?: string;
}) {
  const { t: tr } = useI18n();

  if (rate.value === null) {
    return <span className={cn("text-text-3", className)}>{tr("sin datos")}</span>;
  }
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className={cn("font-medium", !rate.reliable && "text-text-2")}>
        {rate.value}%
      </span>
      <span className="text-xs text-text-3">
        {tr("de ")}{rate.sample} {unit}
        {!rate.reliable && tr(" · muestra chica")}
      </span>
    </span>
  );
}

/** Subtítulo de un bloque dentro de una sección. */
export function Subhead({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-[13px] font-semibold text-text-2">{children}</h4>;
}
