import { z } from "zod";
import { mockGuard } from "@/lib/dev-guard";
import { apiError, parseBody } from "@/lib/api";
import { getCredentialsByPhoneNumberId } from "@/server/whatsapp/credentials";
import {
  buildInboundPayload,
  deliverToWebhook,
} from "@/server/dev/wa-mock-inbound";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    phoneNumberId: z.string().min(1),
    /** Teléfono; omítelo (con fromUserId) para simular un inbound BSUID (003). */
    from: z.string().min(5).optional(),
    fromUserId: z.string().min(3).optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    text: z.string().optional(),
    waMessageId: z.string().optional(),
    timestamp: z.number().optional(),
    // 008 — adjuntos simulados
    mediaId: z.string().optional(),
    mimeType: z.string().optional(),
    caption: z.string().optional(),
    filename: z.string().optional(),
    location: z.record(z.string(), z.unknown()).optional(),
    // 031 — tarjetas de un mensaje `contacts`, con la forma de Meta.
    contacts: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
    // 016 — anuncio de origen simulado (referral)
    ctwaClid: z.string().optional(),
    adHeadline: z.string().optional(),
    adSourceId: z.string().optional(),
    // 018 — o el `referral` entero, con la forma de Meta (image_url incluida)
    referral: z.record(z.string(), z.unknown()).optional(),
    // #78 — respuestas de botón, con la forma de Meta (type "button" e "interactive")
    button: z
      .object({ text: z.string(), payload: z.string().optional() })
      .optional(),
    interactive: z.record(z.string(), z.unknown()).optional(),
    // 039 — el wamid que el cliente cita (llega en `context.id`)
    replyTo: z.string().optional(),
    // 072 — reacción del cliente (type "reaction"); emoji "" la quita
    reaction: z.object({ messageId: z.string(), emoji: z.string() }).optional(),
  })
  .refine((v) => v.from || v.fromUserId, {
    message: "Se requiere from o fromUserId",
  });

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;

  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;

  const creds = await getCredentialsByPhoneNumberId(body.data.phoneNumberId);
  const payload = buildInboundPayload({
    ...body.data,
    wabaId: creds?.wabaId ?? "WABA-MOCK",
  });
  const res = await deliverToWebhook(payload);
  if (!res.ok) {
    return apiError(
      502,
      "webhook_error",
      `El webhook respondió ${res.status}`
    );
  }
  return Response.json({ delivered: true });
}
