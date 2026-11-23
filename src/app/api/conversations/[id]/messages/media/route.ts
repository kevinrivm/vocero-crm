import { apiError, withAuth } from "@/lib/api";
import { getConversation } from "@/server/inbox/queries";
import { SendError, sendMediaMessage } from "@/server/inbox/send";
import { pausarIaTrasEnvioDeLaBandeja } from "@/server/inbox/pausa-manual";
import { MediaValidationError } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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
 * 008 — Envía un adjunto de archivo por la conversación (multipart):
 * `file` (binario, requerido) + `caption` (opcional) + `replyToMessageId`
 * (039, opcional: el id local del mensaje al que responde citando) + `voice=1`
 * (044, opcional: grabado en el compositor, sale como nota de voz). La validación de tipo y
 * tamaño ocurre ANTES de tocar Graph (413/415 con el límite en el mensaje).
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const conv = await getConversation(session.organizationId, id);
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");

  const form = await req.formData().catch(() => null);
  if (!form) {
    return apiError(400, "invalid", "Se esperaba multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(422, "invalid", "Falta el archivo (campo `file`)");
  }
  const captionRaw = form.get("caption");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim()
      ? captionRaw.trim().slice(0, 1024)
      : undefined;

  const replyRaw = form.get("replyToMessageId");
  const replyToMessageId =
    typeof replyRaw === "string" && replyRaw.trim()
      ? replyRaw.trim().slice(0, 64)
      : undefined;

  // 044: grabado en el compositor (nota de voz).
  const voz = form.get("voice") === "1";

  const data = Buffer.from(await file.arrayBuffer());

  try {
    const result = await sendMediaMessage({
      conversationId: id,
      organizationId: session.organizationId,
      file: {
        data,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || undefined,
      },
      caption,
      replyToMessageId,
      voz,
    });
    // 068: un adjunto mandado por una persona también pausa la IA.
    await pausarIaTrasEnvioDeLaBandeja(session.organizationId, id);
    return Response.json({ messageId: result.messageId }, { status: 201 });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return apiError(
        err.code === "too_large" ? 413 : 415,
        err.code,
        err.message
      );
    }
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
