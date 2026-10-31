"use client";

import { useI18n } from "@/components/i18n-provider";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { RespuestaRapida } from "@/lib/respuestas-rapidas";
import { cn } from "@/lib/utils";

/**
 * 049 — El menú de respuestas rápidas que abre la `/` en el compositor.
 *
 * Flota encima de la caja, como el selector de emojis. El teclado lo maneja
 * el compositor (la caja conserva el foco): aquí solo se pinta la lista y se
 * elige con un toque o un clic. `mousedown` y no `click`: elegir no debe
 * robarle el foco a la caja.
 */
export function QuickReplyMenu({
  opciones,
  activa,
  vacio,
  puedeEditar,
  onElegir,
  onActiva,
}: {
  opciones: RespuestaRapida[];
  activa: number;
  /** No hay ninguna respuesta en la organización (no solo en el filtro). */
  vacio: boolean;
  puedeEditar: boolean;
  onElegir: (r: RespuestaRapida) => void;
  onActiva: (i: number) => void;
}) {
  const { t: tr } = useI18n();
  const listaRef = useRef<HTMLUListElement>(null);

  // La fila activa siempre a la vista al moverse con ↑ y ↓.
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${activa}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activa]);

  return (
    <div
      data-testid="menu-respuestas-rapidas"
      className="absolute bottom-full left-2 right-2 z-30 mb-2 max-h-[min(320px,50dvh)] overflow-hidden rounded-xl border border-border-strong bg-popover text-popover-foreground shadow-xl"
    >
      <p className="border-b px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-3">
        {tr("Respuestas rápidas")} </p>
      {vacio ? (
        <div className="space-y-1 px-3 py-3 text-sm">
          <p className="text-text-2">{tr("Aún no hay respuestas rápidas.")}</p>
          {puedeEditar && (
            <Link
              href="/settings/quick-replies"
              className="text-[13px] font-semibold text-brand-ink hover:underline"
              onMouseDown={(e) => e.preventDefault()}
            >
              {tr("Crearlas en Ajustes →")} </Link>
          )}
        </div>
      ) : opciones.length === 0 ? (
        <p className="px-3 py-3 text-sm text-text-2">{tr("Ninguna respuesta coincide.")}</p>
      ) : (
        <ul
          ref={listaRef}
          role="listbox"
          aria-label={tr("Respuestas rápidas")}
          className="max-h-[min(280px,44dvh)] overflow-y-auto py-1"
        >
          {opciones.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === activa}
              data-indice={i}
              onMouseDown={(e) => {
                e.preventDefault();
                onElegir(r);
              }}
              onMouseEnter={() => onActiva(i)}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 px-3 py-2",
                i === activa ? "bg-brand-tint" : "hover:bg-subtle"
              )}
            >
              <span
                className={cn(
                  "font-mono text-[12.5px] font-semibold",
                  i === activa ? "text-brand-text" : "text-foreground"
                )}
              >
                /{r.atajo}
              </span>
              <span className="line-clamp-2 text-[13px] text-text-2">{r.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
