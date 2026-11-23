import {
  MAX_TEXT_CHARS_ANY_CHANNEL,
  TEXT_TOO_LONG_ANY_CHANNEL,
} from "@/server/channels/capabilities";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getConversation, listMessages } from "@/server/inbox/queries";
import { serializeMessage } from "@/server/inbox/ingest";
import { resolverCitas } from "@/server/inbox/quotes";
import { SendError, sendStructured, sendText } from "@/server/inbox/send";
import { pausarIaTrasEnvioDeLaBandeja } from "@/server/inbox/pausa-manual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const row = await getConversation(session.organizationId, id);
  if (!row) return apiError(404, "not_found", "Conversación no encontrada");

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const messages = await listMessages(
    session.organizationId,
    id,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  // 039: las citas del hilo se resuelven en un solo query.
  const citas = await resolverCitas(
    session.organizationId,
    messages.map((r) => r.message)
  );
  return Response.json({
    messages: messages.map((r) =>
      serializeMessage(
        r.message,
        r.media,
        r.message.replyToWaMessageId
          ? citas.get(r.message.replyToWaMessageId) ?? null
          : null
      )
    ),
  });
});

// 039: id LOCAL del mensaje al que se responde citando (opcional).
const replyToMessageId = z.string().trim().min(1).max(64).optional();

// 008: además de texto, el body acepta ubicación y contactos (discriminado
// por `type`; sin `type` sigue siendo texto — compat con clientes previos).
const sendSchema = z.union([
  z.object({
    type: z.literal("text").optional(),
    // 022: el tope de aquí es el del canal que más admite; el de cada
    // canal lo comprueba el envío (`text_too_long`).
    text: z.string().trim().min(1).max(MAX_TEXT_CHARS_ANY_CHANNEL, TEXT_TOO_LONG_ANY_CHANNEL),
    replyToMessageId,
  }),
  z.object({
    type: z.literal("location"),
    location: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      name: z.string().trim().max(1000).optional(),
      address: z.string().trim().max(1000).optional(),
    }),
    replyToMessageId,
  }),
  z.object({
    type: z.literal("contacts"),
    contacts: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          phone: z.string().trim().min(5).max(30),
        })
      )
      .min(1)
      .max(5),
    replyToMessageId,
  }),
]);

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

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, sendSchema);
  if (!body.ok) return body.response;

  try {
    const data = body.data;
    const result =
      "text" in data
        ? await sendText({
            conversationId: id,
            organizationId: session.organizationId,
            text: data.text,
            replyToMessageId: data.replyToMessageId,
          })
        : data.type === "location"
          ? await sendStructured({
              conversationId: id,
              organizationId: session.organizationId,
              kind: "location",
              location: data.location,
              replyToMessageId: data.replyToMessageId,
            })
          : await sendStructured({
              conversationId: id,
              organizationId: session.organizationId,
              kind: "contacts",
              contacts: data.contacts,
              replyToMessageId: data.replyToMessageId,
            });
    // 068: contestó una persona; la IA se hace a un lado, igual que si lo
    // hubiera hecho desde el teléfono. Solo tras un envío que salió.
    await pausarIaTrasEnvioDeLaBandeja(session.organizationId, id);
    return Response.json({ messageId: result.messageId });
  } catch (err) {
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
