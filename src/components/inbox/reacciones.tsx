"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { agruparReacciones, REACCIONES_RAPIDAS, type ReaccionDto } from "@/lib/reacciones";
import { EmojiPicker } from "./emoji-picker";

/** 072 — Lo que necesita la fila para reaccionar a un mensaje. */
export type AccionReaccion = {
  /** La del equipo, si ya hay una (se marca y tocarla la quita). */
  actual: string | null;
  /** Motivo si no se puede ahora (ventana cerrada); null si se puede. */
  bloqueo: string | null;
  /** Recibe el emoji elegido; quien llama decide si pone, cambia o quita. */
  onReact: (emoji: string) => void;
};

/**
 * 072 — La fila de reacciones rápidas (👍 ❤️ 😂 😮 🙏) y «+» para el selector
 * completo. La comparten la carita de escritorio y el menú del teléfono.
 */
export function FilaReacciones({
  reaccion,
  onElegido,
}: {
  reaccion: AccionReaccion;
  /** Se llama tras elegir (para cerrar el panel que la contiene). */
  onElegido: () => void;
}) {
  const elegir = (emoji: string) => {
    onElegido();
    reaccion.onReact(emoji);
  };
  const bloqueada = !!reaccion.bloqueo;
  return (
    <div>
      <div role="group" aria-label="Reaccionar" className="flex items-center justify-between gap-0.5">
        {REACCIONES_RAPIDAS.map((emoji) => {
          const puesta = reaccion.actual === emoji;
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={puesta}
              aria-label={puesta ? `Quitar reacción ${emoji}` : `Reaccionar con ${emoji}`}
              title={reaccion.bloqueo ?? (puesta ? "Quitar tu reacción" : `Reaccionar con ${emoji}`)}
              disabled={bloqueada}
              data-reaccionar={emoji}
              onClick={() => elegir(emoji)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full text-[22px] transition-transform hover:scale-110 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100",
                puesta && "bg-brand-tint ring-1 ring-brand-soft"
              )}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          );
        })}
        {reaccion.actual && !(REACCIONES_RAPIDAS as readonly string[]).includes(reaccion.actual) && (
          <button
            type="button"
            aria-pressed
            aria-label={`Quitar reacción ${reaccion.actual}`}
            title="Quitar tu reacción"
            disabled={bloqueada}
            data-reaccionar={reaccion.actual}
            onClick={() => elegir(reaccion.actual!)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-[22px] ring-1 ring-brand-soft disabled:opacity-40"
          >
            <span aria-hidden>{reaccion.actual}</span>
          </button>
        )}
        <EmojiPicker
          disabled={bloqueada}
          onSelect={elegir}
          triggerContent={<Plus className="h-4 w-4" strokeWidth={2} />}
          triggerLabel="Más reacciones"
          triggerTitle={reaccion.bloqueo ?? "Más reacciones"}
          triggerClassName="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-text-2 hover:text-foreground disabled:opacity-40"
          panelClassName="fixed inset-x-3 top-1/2 z-[60] mx-auto w-auto max-w-[360px] -translate-y-1/2"
          optionLabel="Reaccionar con"
        />
      </div>
      {reaccion.bloqueo && (
        <p data-reaccion-bloqueo className="px-1 pt-1 text-[11.5px] leading-snug text-text-3">
          {reaccion.bloqueo}
        </p>
      )}
    </div>
  );
}

const ANCHO = 280;

/**
 * 072 — Con ratón (059 · D5): la carita junto a ↩ y ↪. Abre la fila en un
 * panel `fixed` pintado en `body`: dentro del hilo (que hace scroll) un
 * `absolute` quedaría cortado, y dentro de la burbuja heredaría sus colores.
 */
export function BotonReaccionar({
  messageId,
  out,
  reaccion,
  className,
}: {
  messageId: string;
  out: boolean;
  reaccion: AccionReaccion;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!abierto) {
      setPos(null);
      return;
    }
    const colocar = () => {
      const r = boton.current?.getBoundingClientRect();
      if (!r) return;
      const alto = panel.current?.offsetHeight ?? 64;
      const vw = window.innerWidth;
      let left = out ? r.right - ANCHO : r.left;
      left = Math.max(8, Math.min(left, vw - ANCHO - 8));
      // Arriba de la carita, como en WhatsApp Web; abajo si no cabe.
      let top = r.top - alto - 6;
      if (top < 8) top = r.bottom + 6;
      setPos({ top, left });
    };
    colocar();
    const id = requestAnimationFrame(colocar);
    window.addEventListener("resize", colocar);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", colocar);
    };
  }, [abierto, out]);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    const fuera = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (panel.current?.contains(e.target) || boton.current?.contains(e.target)) return;
      cerrar();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      cerrar();
      boton.current?.focus();
    };
    // El hilo hace scroll: el panel `fixed` se quedaría flotando suelto.
    const scroll = (e: Event) => {
      if (e.target instanceof Node && panel.current?.contains(e.target)) return;
      cerrar();
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", escape);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [abierto]);

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Reaccionar"
        title="Reaccionar"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        data-boton-reaccionar={messageId}
        className={cn(className, abierto && "opacity-100")}
      >
        <SmilePlus className="h-4 w-4" strokeWidth={1.7} />
      </button>
      {abierto &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Reaccionar al mensaje"
            data-panel-reaccionar={messageId}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ANCHO }}
            className="fixed z-50 rounded-full border border-border-strong bg-popover px-1.5 py-1 text-popover-foreground shadow-pop"
          >
            <FilaReacciones reaccion={reaccion} onElegido={() => setAbierto(false)} />
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * 072 — Las reacciones pegadas debajo de la burbuja, como en WhatsApp: una
 * pastilla por emoji. La del equipo se puede tocar para quitarla (si la
 * ventana lo permite); la del cliente solo dice quién la puso.
 */
export function ReaccionesBurbuja({
  messageId,
  reacciones,
  out,
  onQuitar,
}: {
  messageId: string;
  reacciones: ReaccionDto[];
  out: boolean;
  /** Presente solo si ahora se puede quitar la reacción del equipo. */
  onQuitar?: () => void;
}) {
  if (reacciones.length === 0) return null;
  const grupos = agruparReacciones(reacciones);
  return (
    <div
      data-reacciones={messageId}
      className={cn(
        "relative z-[1] -mt-1.5 flex flex-wrap gap-1 px-2",
        out ? "justify-end" : "justify-start"
      )}
    >
      {grupos.map((g) => {
        const quien = g.nombres.join(", ");
        const contenido = (
          <>
            <span aria-hidden className="text-[14px] leading-none">
              {g.emoji}
            </span>
            {g.cuantos > 1 && (
              <span className="text-[11px] font-medium text-text-2">{g.cuantos}</span>
            )}
          </>
        );
        const clase = cn(
          "inline-flex h-6 items-center gap-0.5 rounded-full border bg-background px-1.5 shadow-sm",
          g.delEquipo ? "border-brand-soft" : "border-border"
        );
        return g.delEquipo && onQuitar ? (
          <button
            key={g.emoji}
            type="button"
            data-reaccion={g.emoji}
            data-actor="equipo"
            onClick={onQuitar}
            aria-label={`${g.emoji} de ${quien}. Toca para quitar tu reacción`}
            title={`${quien} · toca para quitarla`}
            className={cn(clase, "hover:bg-secondary")}
          >
            {contenido}
          </button>
        ) : (
          <span
            key={g.emoji}
            role="img"
            data-reaccion={g.emoji}
            data-actor={g.delEquipo ? "equipo" : "cliente"}
            aria-label={`${g.emoji} de ${quien}`}
            title={quien}
            className={clase}
          >
            {contenido}
          </span>
        );
      })}
    </div>
  );
}
