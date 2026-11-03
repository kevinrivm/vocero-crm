import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { apiError } from "@/lib/api";
import { authenticateBot } from "@/lib/auth/bot";
import { serializeFicha } from "@/server/bot/ficha";
import { findContactByIdentity } from "@/server/inbox/identity";
import { isWindowOpen, windowRemainingMs } from "@/server/inbox/window";
import { windowMsFor } from "@/server/channels/capabilities";
import { citasParaContexto } from "@/server/agenda/context";
import { anuncioDelContacto } from "@/server/attribution/store";
import { siguientesDelLead } from "@/server/bot/stage";

export const dynamic = "force-dynamic";

/**
 * Contexto conversacional y de calificación para agentes externos (solo lectura).
 * GET /api/bot/context?contactId=... | ?leadId=... | ?conversationId=... | ?identity=...
 *
 * Devuelve la información actual del contacto, su etapa en el embudo y las etapas siguientes permitidas (nextStages).
 */
export async function GET(req: Request) {
  const auth = await authenticateBot(req);
  if (!auth.ok) return auth.response;
  const organizationId = auth.organizationId;

  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId");
  const leadId = url.searchParams.get("leadId");
  const conversationId = url.searchParams.get("conversationId");
  const waIdentity =
    url.searchParams.get("identity") ?? url.searchParams.get("waIdentity");

  if (!contactId && !leadId && !conversationId && !waIdentity) {
    return apiError(
      422,
      "invalid",
      "Falta contactId, leadId, identity (o waIdentity) o conversationId"
    );
  }

  const db = getDb();

  let contact: typeof schema.contact.$inferSelect | undefined;
  let conversation: typeof schema.conversation.$inferSelect | undefined;

  // 1. Búsqueda por contactId
  if (contactId) {
    const [foundContact] = await db
      .select()
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          organizationId,
          eq(schema.contact.id, contactId)
        )
      )
      .limit(1);
    contact = foundContact;

    if (contact) {
      const [conv] = await db
        .select()
        .from(schema.conversation)
        .where(
          and(
            scoped(schema.conversation.organizationId, organizationId),
            eq(schema.conversation.contactId, contact.id),
            eq(schema.conversation.isTest, false)
          )
        )
        .orderBy(desc(schema.conversation.createdAt))
        .limit(1);
      conversation = conv;
    }
  }

  // 2. Búsqueda por leadId
  else if (leadId) {
    const rows = await db
      .select({
        lead: schema.lead,
        contact: schema.contact,
      })
      .from(schema.lead)
      .innerJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
      .where(
        scoped(
          schema.lead.organizationId,
          organizationId,
          eq(schema.lead.id, leadId)
        )
      )
      .limit(1);

    if (rows[0]) {
      contact = rows[0].contact;
      const [conv] = await db
        .select()
        .from(schema.conversation)
        .where(
          and(
            scoped(schema.conversation.organizationId, organizationId),
            eq(schema.conversation.contactId, contact.id),
            eq(schema.conversation.isTest, false)
          )
        )
        .orderBy(desc(schema.conversation.createdAt))
        .limit(1);
      conversation = conv;
    }
  }

  // 3. Búsqueda por conversationId
  else if (conversationId) {
    const rows = await db
      .select({ conversation: schema.conversation, contact: schema.contact })
      .from(schema.conversation)
      .innerJoin(
        schema.contact,
        eq(schema.conversation.contactId, schema.contact.id)
      )
      .where(
        and(
          scoped(schema.conversation.organizationId, organizationId),
          eq(schema.conversation.id, conversationId)
        )
      )
      .limit(1);
    contact = rows[0]?.contact;
    conversation = rows[0]?.conversation;
  }

  // 4. Búsqueda por waIdentity / identity
  else if (waIdentity) {
    contact = await findContactByIdentity(organizationId, waIdentity);
    if (contact) {
      const convs = await db
        .select()
        .from(schema.conversation)
        .where(
          and(
            scoped(schema.conversation.organizationId, organizationId),
            eq(schema.conversation.contactId, contact.id),
            eq(schema.conversation.isTest, false)
          )
        )
        .limit(1);
      conversation = convs[0];
    }
  }

  if (!contact) {
    return apiError(404, "not_found", "Contacto no encontrado");
  }

  const [leadRows, booking, anuncio] = await Promise.all([
    db
      .select({ lead: schema.lead, stage: schema.pipelineStage })
      .from(schema.lead)
      .innerJoin(
        schema.pipelineStage,
        eq(schema.lead.stageId, schema.pipelineStage.id)
      )
      .where(
        and(
          scoped(schema.lead.organizationId, organizationId),
          eq(schema.lead.contactId, contact.id)
        )
      )
      .limit(1),
    citasParaContexto(organizationId, contact.id),
    anuncioDelContacto(organizationId, contact.id),
  ]);

  const nextStages = leadRows[0]
    ? await siguientesDelLead(organizationId, leadRows[0].lead.stageId)
    : [];

  return Response.json({
    contact: {
      id: contact.id,
      name: contact.name,
      identity: contact.waIdentity,
      waIdentity: contact.waIdentity,
      channel: contact.channel,
      phone: contact.phone,
      ficha: serializeFicha(contact),
    },
    conversation: conversation
      ? {
          id: conversation.id,
          aiEnabled: conversation.aiEnabled && !conversation.handoffAt,
          handoffAt: conversation.handoffAt?.toISOString() ?? null,
          windowOpen: isWindowOpen(
            conversation.lastInboundAt,
            new Date(),
            windowMsFor(conversation.channel)
          ),
          windowRemainingMs: windowRemainingMs(
            conversation.lastInboundAt,
            new Date(),
            windowMsFor(conversation.channel)
          ),
        }
      : null,
    lead: leadRows[0]
      ? {
          id: leadRows[0].lead.id,
          stageId: leadRows[0].lead.stageId,
          stageName: leadRows[0].stage.name,
          nextStages,
        }
      : null,
    adOrigen: anuncio
      ? {
          headline: anuncio.headline,
          body: anuncio.body,
          sourceType: anuncio.sourceType,
          sourceUrl: anuncio.sourceUrl,
          hasCtwaClid: anuncio.hasCtwaClid,
          capturedAt: anuncio.capturedAt,
        }
      : null,
    ...(booking ? { booking } : {}),
  });
}
