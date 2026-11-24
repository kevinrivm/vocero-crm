/**
 * Motivos por los que un cerebro externo devuelve la conversación a un humano.
 *
 * El catálogo es cerrado, pero se aplica con FALLBACK, nunca rechazando: un
 * motivo fuera de lista no puede costar el handoff. Un 422 aquí dejaría al bot
 * hablándole a alguien que acaba de pedir una persona — el peor final posible
 * de esa ruta. Del otro lado hay un LLM: tarde o temprano manda "porque se
 * enojó" en vez de "hostilidad".
 */

export const HANDOFF_REASONS = [
  "cliente",
  "modelo",
  "error",
  "ventana",
  "hostilidad",
  /**
   * 075 — El cliente se quedó sin respuesta: el CRM volvió a mandar el turno
   * dos veces y nadie contestó, o el cerebro no logró escribir una respuesta
   * que se pudiera enviar. No es una caída del proveedor (`error`) ni una
   * decisión del agente (`modelo`).
   */
  "sin_respuesta",
] as const;

export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export function toHandoffReason(raw: string | undefined | null): HandoffReason {
  const v = raw?.trim().toLowerCase() ?? "";
  return (HANDOFF_REASONS as readonly string[]).includes(v)
    ? (v as HandoffReason)
    : "modelo";
}
