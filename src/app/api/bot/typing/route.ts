import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { mostrarEscribiendo } from "@/server/whatsapp/escribiendo";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ conversationId: z.string().min(1) });

/**
 * Indicador "escribiendo…" + marcar leído el último inbound.
 * POST /api/bot/typing {conversationId}
 *
 * Best-effort por contrato: al bot JAMÁS le vale reintentar esto — si Meta
 * falla se responde 200 {ok:false} y la conversación sigue. El indicador
 * dura hasta ~25 s o hasta que llegue la respuesta real.
 *
 * El envío vive en `server/whatsapp/escribiendo.ts` (078): el CRM también lo
 * manda al encolar el turno.
 */
export async function POST(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const convs = await getDb()
    .select()
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
  if (conv.isTest) {
    // Sandbox: jamás toca la API real (guardrail del Laboratorio).
    return Response.json({ ok: false, reason: "sandbox" });
  }
  if (!conv.aiEnabled || conv.handoffAt) {
    // Handoff/IA pausada: un humano atiende — "escribiendo…" aquí sería
    // mentirle al cliente. Se omite sin tocar Meta.
    return Response.json({ ok: false, reason: "ai_paused" });
  }

  const r = await mostrarEscribiendo(organizationId, conv);
  // El contrato de siempre: sin WhatsApp conectado es un 409, no un `ok:false`.
  if (!r.ok && r.reason === "no_connection") {
    return apiError(409, "no_connection", "WhatsApp no está conectado");
  }
  return Response.json(r);
}
