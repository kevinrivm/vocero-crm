import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { emojiValido } from "@/lib/reacciones";
import { reaccionar, ReaccionError, REACCION_ERROR_STATUS } from "@/server/inbox/reacciones";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; messageId: string }> };

/** 072 — `""` quita la reacción del equipo; un emoji la pone o la cambia. */
const schema = z
  .object({
    emoji: z.string().max(64).refine(emojiValido, "debe ser un emoji o vacío para quitarla"),
  })
  .strict();

/**
 * 072 — El equipo reacciona a un mensaje. Solo personas con sesión de la
 * bandeja: el cerebro y la API v1 no tienen esta ruta (D6). La conversación y
 * el mensaje se buscan con `scoped()` en la organización de la sesión: de
 * otra organización es 404. Reaccionar no pausa la IA: no es una respuesta.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id, messageId } = await ctx.params;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  try {
    const reactions = await reaccionar({
      organizationId: session.organizationId,
      conversationId: id,
      messageId,
      emoji: body.data.emoji,
      userId: session.userId,
    });
    return Response.json({ reactions });
  } catch (err) {
    if (err instanceof ReaccionError) {
      return apiError(REACCION_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
