import { z } from "zod";
import { mockGuard } from "@/lib/dev-guard";
import { apiError, parseBody } from "@/lib/api";
import { getCredentialsByPhoneNumberId } from "@/server/whatsapp/credentials";
import {
  buildEchoPayload,
  deliverToWebhook,
} from "@/server/dev/wa-mock-inbound";

export const dynamic = "force-dynamic";

/**
 * 008 — Simula un echo de coexistence: el dueño respondió A MANO desde la app
 * de WhatsApp Business del teléfono. Entrega el payload firmado al webhook
 * real (misma ruta que Meta). Solo en el entorno de pruebas (dev-guard).
 */
const schema = z.object({
  phoneNumberId: z.string().min(1),
  /** wa_id del lead destinatario. */
  to: z.string().min(5),
  type: z.string().optional(),
  text: z.string().optional(),
  waMessageId: z.string().optional(),
  timestamp: z.number().optional(),
  mediaId: z.string().optional(),
  mimeType: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
  location: z.record(z.string(), z.unknown()).optional(),
  useMessagesKey: z.boolean().optional(),
  // 074 — campos crudos del eco (`edit`…), tal cual los mandaría Meta.
  extra: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;

  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;

  const creds = await getCredentialsByPhoneNumberId(body.data.phoneNumberId);
  const payload = buildEchoPayload({
    ...body.data,
    wabaId: creds?.wabaId ?? "WABA-MOCK",
  });
  const res = await deliverToWebhook(payload);
  if (!res.ok) {
    return apiError(502, "webhook_error", `El webhook respondió ${res.status}`);
  }
  return Response.json({ delivered: true });
}
