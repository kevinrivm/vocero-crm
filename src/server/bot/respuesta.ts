import { z } from "zod";
import {
  MAX_TEXT_CHARS_ANY_CHANNEL,
  TEXT_TOO_LONG_ANY_CHANNEL,
} from "@/server/channels/capabilities";

/**
 * El cuerpo de `POST /api/bot/messages`: cómo contesta un cerebro.
 *
 * Vive fuera de la ruta porque un `route.ts` de Next solo puede exportar sus
 * métodos, y la prueba del contrato necesita leerlo.
 */
export const cuerpoRespuesta = z.object({
  conversationId: z.string().min(1),
  // 022: el tope de aquí es el del canal que más admite; el de cada canal
  // lo comprueba el envío y sale como el mismo 422 `invalid_body` de siempre.
  text: z.string().min(1).max(MAX_TEXT_CHARS_ANY_CHANNEL, TEXT_TOO_LONG_ANY_CHANNEL),
  /**
   * 075 — El `dispatchId` del despacho que esta respuesta contesta. Opcional:
   * un cerebro que no lo mande se comporta como siempre. Si lo manda, tiene
   * que ser un despacho de esa misma conversación.
   */
  dispatchId: z.string().trim().min(1).optional(),
  /**
   * 075 — Con `dispatchId`, pide que la respuesta NO salga si el cliente ya
   * escribió otra vez y hay un despacho posterior: el CRM contesta
   * `409 dispatch_superado` y el cerebro contesta ese otro, que trae toda la
   * ráfaga. Es opt-in porque un cerebro que no conozca ese 409 lo leería como
   * un fallo. Mismo nombre que en Vocero Cloud.
   */
  dropIfSuperseded: z.boolean().optional(),
});

export type CuerpoRespuesta = z.infer<typeof cuerpoRespuesta>;

/**
 * 075 — El código del 409 de un turno superado. La ruta lo escribe literal
 * (la prueba del OpenAPI lee sus 409 del código fuente); la prueba del
 * contrato comprueba que es esta misma cadena.
 */
export const DISPATCH_SUPERADO = "dispatch_superado";
export const MENSAJE_SUPERADO = "El cliente escribió de nuevo; responde el despacho más reciente";

/**
 * 075 — ¿Esta respuesta pidió callar si su turno quedó superado? Hacen falta
 * las dos cosas: saber de qué turno es y haberlo pedido.
 */
export function pideCallarSiSuperado(cuerpo: CuerpoRespuesta): boolean {
  return Boolean(cuerpo.dispatchId) && cuerpo.dropIfSuperseded === true;
}
