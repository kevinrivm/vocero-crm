import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import {
  cuerpoRespuesta,
  MENSAJE_SUPERADO,
  pideCallarSiSuperado,
} from "@/server/bot/respuesta";
import { despachoDe, despachoSuperado } from "@/server/dispatch/outbox";
import { SendError, sendText } from "@/server/inbox/send";
import { guardarRespuestaDePrueba } from "@/server/lab/sandbox";

export const dynamic = "force-dynamic";

/**
 * Envío del cerebro externo A TRAVÉS del CRM: el token de WhatsApp nunca sale
 * de aquí. Usa el mismo camino que el composer de la bandeja (`sendText`), así
 * que el mensaje queda en el hilo marcado como IA, respeta la ventana de 24 h
 * y hereda el guard de sandbox del Laboratorio.
 *
 * 033 — En una conversación de prueba del Laboratorio (`is_test`) la
 * respuesta se GUARDA en el hilo y no se envía: es como un cerebro externo
 * contesta una corrida. Antes respondía 409 `sandbox_violation`.
 *
 * 409 tipados: ai_paused (un humano tomó la conversación) · window_closed ·
 * sandbox_violation · message_limit (022: el canal no admite más mensajes
 * hasta que el cliente escriba; hoy, el tope de TikTok) · dispatch_superado
 * (075: solo si el cerebro mandó `dispatchId` y `dropIfSuperseded`).
 */
export async function POST(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const body = await parseBody(req, cuerpoRespuesta);
  if (!body.ok) return body.response;

  // Gate de handoff: el bot JAMÁS habla sobre una conversación pausada. Se
  // relee aquí porque entre que el bot pidió el contexto y armó su respuesta
  // (segundos de un LLM) el dueño pudo haber tomado la conversación.
  const db = getDb();
  const convs = await db
    .select({
      aiEnabled: schema.conversation.aiEnabled,
      handoffAt: schema.conversation.handoffAt,
      isTest: schema.conversation.isTest,
    })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, body.data.conversationId)
      )
    )
    .limit(1);
  const conv = convs[0];
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");

  /**
   * 075 — Con `dispatchId`, el cerebro dice qué turno contesta. Sin él, todo
   * sigue como antes: un cerebro que no lo conoce no nota nada.
   */
  if (body.data.dispatchId) {
    const despacho = await despachoDe(organizationId, body.data.dispatchId);
    if (!despacho) {
      return apiError(404, "dispatch_desconocido", "Despacho no encontrado");
    }
    if (despacho.conversationId !== body.data.conversationId) {
      return apiError(
        422,
        "conversacion_no_corresponde",
        "El despacho no pertenece a esa conversación"
      );
    }
    /**
     * El cliente volvió a escribir mientras el cerebro pensaba: hay un
     * despacho posterior con toda la ráfaga. Si salieran las dos respuestas,
     * el cliente leería dos mensajes seguidos que se pisan. Solo si el
     * cerebro lo pidió: uno que no sepa callarse leería este 409 como fallo.
     */
    if (pideCallarSiSuperado(body.data) && (await despachoSuperado(despacho))) {
      console.info(
        `[bot] ${despacho.id} superado en ${despacho.conversationId}: el cliente volvió a escribir; contesta el despacho siguiente`
      );
      return apiError(409, "dispatch_superado", MENSAJE_SUPERADO);
    }
  }

  if (!conv.aiEnabled || conv.handoffAt) {
    return apiError(409, "ai_paused", "La IA está en pausa en esta conversación");
  }
  if (conv.isTest) {
    const guardada = await guardarRespuestaDePrueba({
      organizationId,
      conversationId: body.data.conversationId,
      text: body.data.text,
    });
    return Response.json({ messageId: guardada.messageId, status: "sent" });
  }

  try {
    const result = await sendText({
      conversationId: body.data.conversationId,
      organizationId,
      text: body.data.text,
      aiGenerated: true,
    });
    return Response.json({ messageId: result.messageId });
  } catch (err) {
    if (err instanceof SendError) {
      if (err.code === "window_closed") {
        return apiError(409, "window_closed", err.message);
      }
      if (err.code === "sandbox_violation") {
        return apiError(409, "sandbox_violation", err.message);
      }
      if (err.code === "message_limit") {
        return apiError(409, "message_limit", err.message);
      }
      // Un texto de más de 4,096 caracteres por WhatsApp ya daba 422
      // `invalid_body` (lo cortaba el esquema): se conserva el código.
      if (err.code === "text_too_long") {
        return apiError(422, "invalid_body", err.message);
      }
      return apiError(502, err.code, err.message);
    }
    throw err;
  }
}
