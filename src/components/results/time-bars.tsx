"use client";

import { useI18n } from "@/components/i18n-provider";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type TimePoint = {
  bucket: string;
  value: number;
  /** Lo que dice el tooltip de esa barra, después del valor. */
  detail?: string;
};

/**
 * 019 — Una serie en el tiempo, en barras. UNA magnitud por gráfica: Cloud
 * pintaba prospectos (barras) y dinero (línea) con dos escalas en el mismo
 * lienzo, y dos ejes en una gráfica hacen que el ojo compare alturas que no
 * se pueden comparar. Aquí son dos gráficas, cada una con su escala.
 *
 * HTML y no SVG escalado: con `viewBox` el texto se encoge con el ancho y en
 * un teléfono las fechas quedaban de 5 px. Las barras miden a lo sumo 24 px,
 * redondeadas arriba y rectas en la base; el valor de cada una sale al pasar
 * el puntero, y la tabla equivalente queda para el lector de pantalla.
 */
export function TimeBars({
  title,
  points,
  format,
  unit,
  emptyText = "Sin movimientos en el periodo.",
}: {
  title: string;
  points: TimePoint[];
  format: (v: number) => string;
  /** Qué cuenta la serie, para la tabla accesible ("prospectos", "ventas"). */
  unit: string;
  emptyText?: string;
}) {
  const { t: tr } = useI18n();

  const [activo, setActivo] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((p) => p.value));
  const tope = escalaLimpia(max);
  const n = points.length;
  const total = points.reduce((a, p) => a + p.value, 0);
  const cada = Math.max(1, Math.ceil(n / 6));

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-text-2">{title}</span>
        <span className="text-xs text-text-3">
          {format(total)} {tr(" en el periodo")}</span>
      </figcaption>

      {max === 0 ? (
        <p className="flex h-36 items-center justify-center rounded-md border border-dashed text-sm text-text-3">
          {emptyText}
        </p>
      ) : (
        <>
          <div
            className="relative mt-3 h-36"
            onPointerLeave={() => setActivo(null)}
            aria-hidden
          >
            {/* Una sola referencia de escala, recesiva: el tope, y la base. */}
            <div className="absolute inset-x-0 top-0 border-t border-border" />
            <span className="absolute right-0 top-0 -translate-y-full pb-0.5 text-[10px] leading-none text-text-3">
              {format(tope)}
            </span>
            <div className="absolute inset-x-0 bottom-0 border-t border-border-strong" />

            <div className="absolute inset-0 flex items-end">
              {points.map((p, i) => (
                <div
                  key={p.bucket}
                  className="flex h-full min-w-0 flex-1 items-end justify-center"
                  onPointerEnter={() => setActivo(i)}
                  onPointerDown={() => setActivo(i)}
                >
                  {p.value > 0 && (
                    <div
                      className={cn(
                        "w-[70%] max-w-[24px] rounded-t-[4px] bg-brand transition-opacity",
                        activo !== null && activo !== i && "opacity-45"
                      )}
                      style={{ height: `${Math.max(2, (p.value / tope) * 100)}%` }}
                    />
                  )}
                </div>
              ))}
            </div>

            {activo !== null && points[activo] && (
              <Tooltip
                point={points[activo]}
                index={activo}
                n={n}
                bottomPct={(points[activo].value / tope) * 100}
                format={format}
              />
            )}
          </div>

          <div className="relative mt-1 h-4 text-[11px] text-text-3" aria-hidden>
            {points.map((p, i) =>
              i % cada === 0 ? (
                <span
                  key={p.bucket}
                  className="absolute top-0 whitespace-nowrap"
                  style={anclaje(i, n)}
                >
                  {etiqueta(p.bucket, tr.intl)}
                </span>
              ) : null
            )}
          </div>

          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">{tr("Fecha")}</th>
                <th scope="col">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.bucket}>
                  <td>{etiqueta(p.bucket, tr.intl)}</td>
                  <td>
                    {format(p.value)}
                    {p.detail ? ` · ${p.detail}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}

function Tooltip({
  point,
  index,
  n,
  bottomPct,
  format,
}: {
  point: TimePoint;
  index: number;
  n: number;
  bottomPct: number;
  format: (v: number) => string;
}) {
  const { t: tr } = useI18n();

  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-border-strong bg-popover px-2 py-1 text-xs shadow-md"
      style={{ ...anclaje(index, n), bottom: `calc(${Math.min(bottomPct, 100)}% + 6px)` }}
    >
      <strong className="font-semibold text-foreground">{format(point.value)}</strong>
      {point.detail && <span className="text-text-2"> · {point.detail}</span>}
      <span className="text-text-3"> · {etiqueta(point.bucket, tr.intl)}</span>
    </div>
  );
}

/**
 * Dónde se ancla algo que va sobre la barra `i` de `n`: centrado, salvo en las
 * orillas, donde se recarga hacia adentro para no salirse de la tarjeta (y no
 * ensanchar la página en un teléfono).
 */
function anclaje(i: number, n: number): React.CSSProperties {
  const centro = ((i + 0.5) / n) * 100;
  if (centro < 15) return { left: `${(i / n) * 100}%` };
  if (centro > 85) return { right: `${((n - i - 1) / n) * 100}%` };
  return { left: `${centro}%`, transform: "translateX(-50%)" };
}

/**
 * El tope de la escala, redondeado a un número limpio (1, 2, 5 × 10ⁿ) que
 * cubre el máximo: una referencia de "37" no se lee; una de "40", sí.
 */
export function escalaLimpia(max: number): number {
  if (max <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    if (paso * potencia >= max) return paso * potencia;
  }
  return 10 * potencia;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-08-13` → `13 ago` · `2026-08` → `ago 26`. */
export function etiqueta(bucket: string, locale = "es-MX"): string {
  if (locale === "pt-BR") return new Intl.DateTimeFormat(locale,{timeZone:"UTC",month:"short",...(bucket.length === 7 ? {year:"2-digit"} as const : {day:"numeric"} as const)}).format(new Date(bucket + (bucket.length === 7 ? "-01" : "") + "T12:00:00Z"));
  const partes = bucket.split("-");
  const mes = MESES[Number(partes[1]) - 1] ?? "";
  if (partes.length === 2) return `${mes} ${partes[0]!.slice(2)}`;
  return `${Number(partes[2])} ${mes}`;
}
