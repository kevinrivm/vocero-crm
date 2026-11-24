/**
 * 056 — Lo puro de los avisos del sistema y de la reconexión del tiempo real:
 * cuándo avisa (D2), qué dice (D3) y cuánto espera antes de reintentar (D6).
 */
import { mediaLabel } from "@/components/inbox/helpers";

/** El texto del aviso no pasa de aquí. */
export const AVISO_MAX_CARACTERES = 120;
/** Un corte más corto que esto no pinta la banda (D5): no parpadea. */
export const RETRASO_BANDA_MS = 4000;
/** Tope de la espera entre reintentos del canal en tiempo real (D6). */
export const ESPERA_MAX_MS = 30_000;

/**
 * D2 — ¿Este mensaje merece un aviso del sistema? Solo los del cliente, con la
 * campana activa y el permiso concedido, y cuando el operador no está mirando
 * Vocero (si lo está, ya suena).
 */
export function debeAvisarSistema(c: {
  direction?: string;
  campana: boolean;
  permiso: string;
  visible: boolean;
  foco: boolean;
}): boolean {
  if (c.direction !== "in" || !c.campana || c.permiso !== "granted") return false;
  return !(c.visible && c.foco);
}

/** D3 — El texto del aviso: el mensaje recortado, o la etiqueta del adjunto. */
export function cuerpoAviso(m: {
  type?: string;
  text?: string | null;
  media?: { kind: string; caption?: string | null } | null;
}): string {
  const texto = (m.text ?? m.media?.caption ?? "").replace(/\s+/g, " ").trim();
  if (texto) {
    return texto.length > AVISO_MAX_CARACTERES
      ? `${texto.slice(0, AVISO_MAX_CARACTERES - 1).trimEnd()}…`
      : texto;
  }
  if (m.media) return mediaLabel(m.media.kind);
  return m.type && m.type !== "text" ? mediaLabel(m.type) : "Mensaje nuevo";
}

/** D3 — A dónde lleva el aviso al tocarlo. */
export function urlDeConversacion(conversationId: string): string {
  return `/inbox?conversation=${encodeURIComponent(conversationId)}`;
}

/**
 * Solo se navega a rutas de la Bandeja de la propia app: un `data.url`
 * manipulado no puede sacar al operador a otro sitio.
 */
export function urlDeAvisoSegura(url: unknown): string | null {
  return typeof url === "string" && /^\/inbox(\?(conversation=[\w%-]+(&vista=esperando)?|vista=esperando))?$/.test(url) ? url : null;
}

/** D6 — 1 s, 2 s, 4 s… hasta 30 s. */
export function esperaReintento(intento: number): number {
  return Math.min(ESPERA_MAX_MS, 1000 * 2 ** Math.max(0, intento));
}
