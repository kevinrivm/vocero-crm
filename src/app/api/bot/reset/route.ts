import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { publish } from "@/server/events/bus";
import { moveLeadToStage } from "@/server/leads/stage-history";
import { createLogger } from "@/lib/logger";

const log = createLogger("bot/reset");

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().min(1),
});

/**
 * Reinicio de UNA conversación para la línea de pruebas del operador: IA
 * reactivada (sale del handoff) y lead de vuelta a la primera etapa. El
 * historial del inbox NO se borra: es auditoría. Lo invoca el cerebro externo
 * cuando un número de su allowlist manda `/reset`.
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

  const db = getDb();
  const rows = await db
    .select({
      id: schema.conversation.id,
      contactId: schema.conversation.contactId,
    })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, body.data.conversationId)
      )
    )
    .limit(1);
  const conv = rows[0];
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");

  await db
    .update(schema.conversation)
    .set({
      aiEnabled: true,
      handoffAt: null,
      handoffReason: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.conversation.id, conv.id));

  // Etapa al inicio del funnel (best-effort: sin etapas no revienta el reset).
  try {
    const stages = await db
      .select()
      .from(schema.pipelineStage)
      .where(eq(schema.pipelineStage.organizationId, organizationId));
    const first = [...stages].sort((a, b) => a.position - b.position)[0];
    const leadRows = await db
      .select({ id: schema.lead.id })
      .from(schema.lead)
      .where(
        and(
          eq(schema.lead.organizationId, organizationId),
          eq(schema.lead.contactId, conv.contactId)
        )
      )
      .limit(1);
    if (first && leadRows[0]) {
      // Por la puerta única: devolver la conversación de pruebas al inicio
      // también es un movimiento, y la bitácora tiene que poder explicar por
      // qué un lead retrocedió de etapa.
      await moveLeadToStage({
        organizationId,
        leadId: leadRows[0].id,
        toStageId: first.id,
        source: "sistema",
      });
    }
  } catch (err) {
    log.warn("reinicio de etapa falló", { err });
  }

  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conv.id } },
  });
  return Response.json({ ok: true });
}
