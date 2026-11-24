import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { textoEventoEtapa, textoTraspaso, textoVuelta, type EventoHiloDto } from "@/lib/eventos-hilo";
import { vueltasDeConversacion } from "@/server/inbox/reactivacion";

/**
 * 054 — Los eventos del hilo de una conversación, por hora: los cambios de
 * etapa de su lead (de `lead_stage_event`) y el traspaso vigente a una
 * persona. `null` si la conversación no es de la organización.
 */
export async function eventosDeConversacion(
  organizationId: string,
  conversationId: string
): Promise<EventoHiloDto[] | null> {
  const db = getDb();
  const convRows = await db
    .select({
      contactId: schema.conversation.contactId,
      isTest: schema.conversation.isTest,
      handoffAt: schema.conversation.handoffAt,
      handoffReason: schema.conversation.handoffReason,
    })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  const conv = convRows[0];
  if (!conv) return null;

  const eventos: EventoHiloDto[] = [];

  // El Laboratorio no tiene lead en el embudo (D5).
  if (!conv.isTest) {
    const filas = await db
      .select({
        id: schema.leadStageEvent.id,
        fromStageName: schema.leadStageEvent.fromStageName,
        toStageName: schema.leadStageEvent.toStageName,
        lossReason: schema.leadStageEvent.lossReason,
        source: schema.leadStageEvent.source,
        occurredAt: schema.leadStageEvent.occurredAt,
        // Solo el nombre: ni el correo ni el id de quien lo movió (D5).
        actorNombre: schema.user.name,
      })
      .from(schema.leadStageEvent)
      .leftJoin(schema.user, eq(schema.leadStageEvent.actorUserId, schema.user.id))
      .where(
        scoped(
          schema.leadStageEvent.organizationId,
          organizationId,
          and(
            eq(schema.leadStageEvent.contactId, conv.contactId),
            // Una fecha sembrada en una migración no se observó (D1).
            eq(schema.leadStageEvent.approximate, false)
          )
        )
      )
      .orderBy(asc(schema.leadStageEvent.occurredAt));
    for (const f of filas) {
      eventos.push({
        id: f.id,
        tipo: "etapa",
        texto: textoEventoEtapa(f),
        createdAt: f.occurredAt.toISOString(),
      });
    }
  }

  // 076: cada vez que la IA volvió sola, con la pausa que terminó. Al volver
  // se borra `handoff_at`: sin esto el hilo ya no diría que hubo una persona.
  for (const v of await vueltasDeConversacion(organizationId, conversationId)) {
    if (v.pausadaDesde) {
      eventos.push({
        id: `traspaso-${v.id}`,
        tipo: "traspaso",
        texto: textoTraspaso(v.motivoPausa),
        createdAt: v.pausadaDesde.toISOString(),
      });
    }
    eventos.push({
      id: v.id,
      tipo: "vuelta",
      texto: textoVuelta(v.motivo, v.horas),
      createdAt: v.occurredAt.toISOString(),
    });
  }

  if (conv.handoffAt) {
    eventos.push({
      id: `traspaso-${conversationId}`,
      tipo: "traspaso",
      texto: textoTraspaso(conv.handoffReason),
      createdAt: conv.handoffAt.toISOString(),
    });
  }

  return eventos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
