import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { apiError, parseBody } from "@/lib/api";
import { authenticateBot } from "@/lib/auth/bot";
import { moverEtapaPorElCerebro } from "@/server/bot/stage";
import { moveLeadToStage } from "@/server/leads/stage-history";
import { publish } from "@/server/events/bus";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  leadId: z.string().optional(),
  stageId: z.string().optional(),
  stage: z.string().optional(),
  conversationId: z.string().optional(),
});

/**
 * El cerebro externo o calificador mueve la etapa de un lead en el embudo de ventas.
 * Valida que el lead y la etapa pertenezcan a la misma organización.
 */
export async function POST(req: Request) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return auth.response;
  const organizationId = auth.organizationId;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();

  // 1. Camino directo: por leadId y stageId / stage
  if (body.data.leadId) {
    const [lead] = await db
      .select({
        id: schema.lead.id,
        stageId: schema.lead.stageId,
        contactId: schema.lead.contactId,
      })
      .from(schema.lead)
      .where(
        and(
          scoped(schema.lead.organizationId, organizationId),
          eq(schema.lead.id, body.data.leadId)
        )
      )
      .limit(1);

    if (!lead) {
      return apiError(404, "not_found", "Lead no encontrado en este tenant");
    }

    const targetQuery = (body.data.stageId || body.data.stage || "").trim();
    if (!targetQuery) {
      return apiError(422, "invalid", "Falta stageId o stage");
    }

    // Validar que la etapa pertenezca al mismo tenant
    const stages = await db
      .select({
        id: schema.pipelineStage.id,
        name: schema.pipelineStage.name,
        position: schema.pipelineStage.position,
        kind: schema.pipelineStage.kind,
      })
      .from(schema.pipelineStage)
      .where(scoped(schema.pipelineStage.organizationId, organizationId));

    const targetStage =
      stages.find((s) => s.id === targetQuery) ||
      stages.find(
        (s) => s.name.trim().toLowerCase() === targetQuery.toLowerCase()
      );

    if (!targetStage) {
      return apiError(
        404,
        "not_found",
        "La etapa no existe o no pertenece al mismo tenant"
      );
    }

    // Única puerta reglamentaria para actualizar la etapa del lead y registrar historial
    const res = await moveLeadToStage({
      organizationId,
      leadId: lead.id,
      toStageId: targetStage.id,
      source: "bot",
      extra: { lastActivityAt: new Date() },
    });

    if (!res.ok) {
      return apiError(400, "error", "No se pudo actualizar la etapa del lead");
    }

    // Buscar si hay una conversación activa asociada para actualizarla en vivo en el Kanban y Bandeja
    const [conv] = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(
        and(
          scoped(schema.conversation.organizationId, organizationId),
          eq(schema.conversation.contactId, lead.contactId)
        )
      )
      .limit(1);

    if (conv) {
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: conv.id } },
      });
    }

    return Response.json({
      ok: true,
      changed: res.changed,
      lead: {
        id: lead.id,
        stageId: targetStage.id,
        stageName: targetStage.name,
      },
    });
  }

  // 2. Camino por conversationId (compatibilidad con Nea/despacho)
  if (body.data.conversationId) {
    const stageQuery = body.data.stage || body.data.stageId || "";
    if (!stageQuery.trim()) {
      return apiError(422, "invalid", "Falta stage o stageId");
    }

    const res = await moverEtapaPorElCerebro({
      organizationId,
      conversationId: body.data.conversationId,
      stage: stageQuery,
    });

    if (!res.ok) return apiError(res.status, res.code, res.message);

    if (res.changed) {
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: res.conversationId } },
      });
    }

    return Response.json({ ok: true, changed: res.changed, lead: res.lead });
  }

  return apiError(422, "invalid", "Se requiere leadId o conversationId");
}
