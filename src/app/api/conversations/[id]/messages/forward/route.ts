import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getConversation } from "@/server/inbox/queries";
import { ForwardImageError } from "@/server/inbox/forward-image";
import { forwardMessage } from "@/server/inbox/forward-message";
import { pausarIaTrasEnvioDeLaBandeja } from "@/server/inbox/pausa-manual";
import { SendError } from "@/server/inbox/send";
import { MediaValidationError } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Solo el id del mensaje de origen: nada de URLs ni rutas (`.strict()`).
const bodySchema = z
  .object({
    sourceMessageId: z.string().regex(/^[\w-]{1,64}$/),
    caption: z.string().trim().max(1024).optional(),
  })
  .strict();

const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation: 403,
  not_connected: 409,
  reconnect_required: 409,
  window_closed: 409,
  message_limit: 409,
  text_too_long: 422,
  meta_error: 422,
  meta_unavailable: 503,
  upload_failed: 502,
  reply_unavailable: 422,
};

/**
 * 059 — Reenvía a ESTA conversación cualquier mensaje del historial
 * (`{ sourceMessageId, caption? }`): el texto como texto y un adjunto como
 * archivo nuevo. Destino y origen se resuelven dentro de la organización de la
 * sesión; lo ajeno o inexistente es 404.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const target = await getConversation(session.organizationId, id);
  if (!target) return apiError(404, "not_found", "Conversación no encontrada");
  if (target.conversation.isTest) {
    return apiError(403, "sandbox_violation", "No se reenvían mensajes al Laboratorio");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    const result = await forwardMessage({
      organizationId: session.organizationId,
      conversationId: id,
      ...body.data,
    });
    // 068: reenviar lo hace una persona: la IA se hace a un lado.
    await pausarIaTrasEnvioDeLaBandeja(session.organizationId, id);
    return Response.json({ messageId: result.messageId }, { status: 201 });
  } catch (err) {
    if (err instanceof ForwardImageError) return apiError(err.status, err.code, err.message);
    if (err instanceof MediaValidationError) {
      return apiError(err.code === "too_large" ? 413 : 415, err.code, err.message);
    }
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
