import {
  MAX_TEXT_CHARS_ANY_CHANNEL,
  TEXT_TOO_LONG_ANY_CHANNEL,
} from "@/server/channels/capabilities";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { apiError, parseBody } from "@/lib/api";
import { authenticateBot } from "@/lib/auth/bot";
import { SendError, sendText } from "@/server/inbox/send";
import { guardarRespuestaDePrueba } from "@/server/lab/sandbox";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().optional(),
  contactId: z.string().optional(),
  text: z.string().min(1).max(MAX_TEXT_CHARS_ANY_CHANNEL, TEXT_TOO_LONG_ANY_CHANNEL),
});

/**
 * Envío de mensajes del agente externo (ej. Nea) a través de Nexia:
 * Guarda el mensaje con la marca is_ai / ai_generated: true,
 * emite el evento al Bus de SSE para la bandeja en tiempo real y
 * envía el mensaje al cliente a través del canal correspondiente (WhatsApp / Meta / Evolution).
 */
export async function POST(req: Request) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return auth.response;
  const organizationId = auth.organizationId;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  let conversationId = body.data.conversationId;

  // Si envían contactId en lugar de conversationId, resolvemos la conversación activa
  if (!conversationId && body.data.contactId) {
    const [foundConv] = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(
        and(
          scoped(schema.conversation.organizationId, organizationId),
          eq(schema.conversation.contactId, body.data.contactId),
          eq(schema.conversation.isTest, false)
        )
      )
      .orderBy(desc(schema.conversation.createdAt))
      .limit(1);

    if (!foundConv) {
      return apiError(
        404,
        "not_found",
        "No se encontró conversación activa para este contacto"
      );
    }
    conversationId = foundConv.id;
  }

  if (!conversationId) {
    return apiError(422, "invalid", "Se requiere conversationId o contactId");
  }

  // Gate de handoff: el bot JAMÁS habla sobre una conversación pausada por un humano
  const convs = await db
    .select({
      aiEnabled: schema.conversation.aiEnabled,
      handoffAt: schema.conversation.handoffAt,
      isTest: schema.conversation.isTest,
    })
    .from(schema.conversation)
    .where(
      and(
        scoped(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);

  const conv = convs[0];
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");
  if (!conv.aiEnabled || conv.handoffAt) {
    return apiError(409, "ai_paused", "La IA está en pausa en esta conversación");
  }

  if (conv.isTest) {
    const guardada = await guardarRespuestaDePrueba({
      organizationId,
      conversationId,
      text: body.data.text,
    });
    return Response.json({ messageId: guardada.messageId, status: "sent" });
  }

  try {
    const result = await sendText({
      conversationId,
      organizationId,
      text: body.data.text,
      aiGenerated: true,
    });
    return Response.json({ messageId: result.messageId, status: "sent" });
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
      if (err.code === "text_too_long") {
        return apiError(422, "invalid_body", err.message);
      }
      return apiError(502, err.code, err.message);
    }
    throw err;
  }
}
