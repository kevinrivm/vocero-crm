/**
 * 072 — Reacciones a mensajes. Puro: lo usan el hilo, la ruta y la ingesta.
 */

import type { Channel } from "@/lib/channels";

/** La fila rápida, en el orden de WhatsApp. */
export const REACCIONES_RAPIDAS = ["👍", "❤️", "😂", "😮", "🙏"] as const;

/** Una reacción como la ve la bandeja. */
export type ReaccionDto = {
  emoji: string;
  /** `cliente` = el contacto de la conversación; `equipo` = el negocio. */
  actor: "cliente" | "equipo";
  /** Quién reaccionó: el nombre del contacto o el de la persona del equipo. */
  nombre: string | null;
};

/** Lo que se pinta debajo de la burbuja: una pastilla por emoji. */
export type GrupoReaccion = {
  emoji: string;
  cuantos: number;
  nombres: string[];
  /** Incluye la reacción del equipo: tocarla la quita. */
  delEquipo: boolean;
};

export function agruparReacciones(reacciones: readonly ReaccionDto[]): GrupoReaccion[] {
  const grupos = new Map<string, GrupoReaccion>();
  for (const r of reacciones) {
    const g = grupos.get(r.emoji) ?? { emoji: r.emoji, cuantos: 0, nombres: [], delEquipo: false };
    g.cuantos++;
    g.nombres.push(r.nombre ?? (r.actor === "equipo" ? "Tu equipo" : "Cliente"));
    if (r.actor === "equipo") g.delEquipo = true;
    grupos.set(r.emoji, g);
  }
  return [...grupos.values()];
}

/** La reacción del equipo en un mensaje, si la hay. */
export function reaccionDelEquipo(reacciones: readonly ReaccionDto[] | undefined): string | null {
  return reacciones?.find((r) => r.actor === "equipo")?.emoji ?? null;
}

/**
 * Qué mandar al elegir un emoji: el mismo que ya está puesto lo quita (`""`),
 * otro lo reemplaza.
 */
export function emojiAlElegir(actual: string | null, elegido: string): string {
  return actual === elegido ? "" : elegido;
}

const PICTOGRAMA = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Un emoji (con modificadores y uniones) y nada más; `""` = quitar. */
export function emojiValido(emoji: string): boolean {
  if (emoji === "") return true;
  if ([...emoji].length > 16) return false;
  // Las teclas (1️⃣, #️⃣) no son pictogramas para Unicode: se apartan antes.
  const sinTeclas = emoji.replace(/[#*0-9]\u{FE0F}?\u{20E3}/gu, "");
  if (sinTeclas === emoji && !PICTOGRAMA.test(emoji)) return false;
  // Ni letras, ni dígitos sueltos, ni espacios: solo el emoji.
  return !/[\p{L}\p{N}\s]/u.test(sinTeclas);
}

/**
 * El id del mensaje en Zernio a partir del que guarda el CRM: los entrantes de
 * Instagram y Messenger van prefijados (`ig_` / `fb_`) y un mensaje con varios
 * adjuntos puede partirse en `#2`, `#3`… que son el MISMO mensaje en la
 * plataforma.
 */
export function idZernioDe(waMessageId: string): string {
  return waMessageId.replace(/^(ig|fb)_/, "").replace(/#\d+$/, "");
}

/**
 * Se puede reaccionar si el mensaje tiene un id de la plataforma de verdad.
 * `zernio_…` es el respaldo que se inventa cuando Zernio no devolvió id.
 */
export function esReaccionable(m: { waMessageId: string | null; type: string }): boolean {
  if (!m.waMessageId) return false;
  if (m.waMessageId.startsWith("zernio_")) return false;
  return m.type !== "reaction";
}

/** Canales en los que la bandeja ofrece reaccionar (D4). */
export function canalReacciona(channel: Channel): boolean {
  return channel === "whatsapp" || channel === "instagram" || channel === "messenger";
}

export const MOTIVO_VENTANA_CERRADA = "Ventana de 24 horas cerrada: no se puede reaccionar";
