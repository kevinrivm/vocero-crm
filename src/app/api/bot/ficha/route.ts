import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { apiError, parseBody } from "@/lib/api";
import { authenticateBot } from "@/lib/auth/bot";
import { upsertFicha } from "@/server/bot/ficha";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  contactId: z.string().optional(),
  conversationId: z.string().optional(),
  leadId: z.string().optional(),
  // Objeto libre a propósito: el agente externo guarda datos calificados (presupuesto, requerimientos, etc.)
  ficha: z.record(z.unknown()),
});

/**
 * Ficha de calificación del lead, escrita por un cerebro externo (ej. Nea).
 * Actualiza el campo ficha (JSONB) del contacto realizando un merge campo a campo.
 * Devuelve la ficha completa resultante.
 */
export async function PUT(req: Request) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return auth.response;
  const organizationId = auth.organizationId;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  let targetContactId = body.data.contactId;

  // 1. Resolver por contactId directo
  if (targetContactId) {
    const [c] = await db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          organizationId,
          eq(schema.contact.id, targetContactId)
        )
      )
      .limit(1);

    if (!c) return apiError(404, "not_found", "Contacto no encontrado en este tenant");
  }

  // 2. Resolver por conversationId
  else if (body.data.conversationId) {
    const [conv] = await db
      .select({ contactId: schema.conversation.contactId })
      .from(schema.conversation)
      .where(
        and(
          scoped(schema.conversation.organizationId, organizationId),
          eq(schema.conversation.id, body.data.conversationId)
        )
      )
      .limit(1);

    if (!conv) return apiError(404, "not_found", "Conversación no encontrada en este tenant");
    targetContactId = conv.contactId;
  }

  // 3. Resolver por leadId
  else if (body.data.leadId) {
    const [lead] = await db
      .select({ contactId: schema.lead.contactId })
      .from(schema.lead)
      .where(
        and(
          scoped(schema.lead.organizationId, organizationId),
          eq(schema.lead.id, body.data.leadId)
        )
      )
      .limit(1);

    if (!lead) return apiError(404, "not_found", "Lead no encontrado en este tenant");
    targetContactId = lead.contactId;
  } else {
    return apiError(
      422,
      "invalid",
      "Se requiere al menos contactId, conversationId o leadId"
    );
  }

  const result = await upsertFicha({
    organizationId,
    contactId: targetContactId,
    ficha: body.data.ficha,
  });

  if (!result) return apiError(404, "not_found", "Contacto no encontrado");
  return Response.json(result);
}
