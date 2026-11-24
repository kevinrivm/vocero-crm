"use client";

import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** 070 — Texto de la acción, igual en la fila y en la cabecera. */
export function etiquetaFijar(pinned: boolean) {
  return pinned ? "Desfijar chat" : "Fijar chat";
}

/** Chincheta junto a la hora de un chat fijado. */
export function PinMark({ pinned }: { pinned: boolean }) {
  if (!pinned) return null;
  return (
    <Pin
      data-fijado
      aria-label="Chat fijado"
      className="h-3 w-3 shrink-0 rotate-45 fill-current text-text-3"
      strokeWidth={1.8}
    />
  );
}

/**
 * Botón de la fila: aparece al pasar el mouse o con el foco del teclado. Solo
 * en pantallas con mouse (md+); en el celular se fija desde la cabecera del
 * chat abierto, para no fijar por accidente al tocar la fila.
 */
export function PinRowButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void;
}) {
  const label = etiquetaFijar(pinned);
  return (
    <button
      type="button"
      data-fijar-fila
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={label}
      title={label}
      className={cn(
        "absolute bottom-2 right-3 hidden rounded-full border border-border-strong bg-background p-1 text-text-3 shadow-sm transition-opacity hover:text-foreground md:flex",
        "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      )}
    >
      {pinned ? (
        <PinOff className="h-3.5 w-3.5" strokeWidth={1.8} />
      ) : (
        <Pin className="h-3.5 w-3.5" strokeWidth={1.8} />
      )}
    </button>
  );
}

/** Botón de la cabecera del chat abierto: la vía en el celular. */
export function PinHeaderButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void;
}) {
  const label = etiquetaFijar(pinned);
  return (
    <button
      type="button"
      data-fijar-cabecera
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-pressed={pinned}
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-text-2 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {pinned ? (
        <PinOff className="h-3.5 w-3.5" strokeWidth={1.8} />
      ) : (
        <Pin className="h-3.5 w-3.5" strokeWidth={1.8} />
      )}
      <span className="max-sm:sr-only">{pinned ? "Desfijar" : "Fijar"}</span>
    </button>
  );
}
