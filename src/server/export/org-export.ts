import { asc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/**
 * Export de los datos del negocio, por organización (franja "tus datos son
 * tuyos"). Devuelve un objeto plano serializable a JSON: contactos, leads con
 * su etapa, conversaciones con sus mensajes, etapas del pipeline, citas y
 * corridas del Laboratorio.
 *
 * Qué NO se exporta, a propósito:
 * - Credenciales (metaCredentials, instagramCredentials, zoom/google, capi):
 *   secretos cifrados en reposo; un export que los revele sería un fuga, no
 *   una copia de seguridad. El token de WhatsApp ni siquiera se muestra en la
 *   UI completa — menos aún saldría en un dump.
 * - Sesiones/usuarios/miembros: pertenecen a la plataforma, no al negocio.
 * - Conversaciones del Laboratorio (isTest) y sus contactos sintéticos: son
 *   artefactos de prueba, no datos del cliente.
 *
 * El dump es UNA respuesta JSON (no streaming): acotado por el tamaño real
 * de una organización (miles de mensajes, no millones). Una instancia que
 * crezca a tamaños donde esto duela ya necesita otra conversación.
 */

export type ExportContact = {
  id: string;
  name: string | null;
  phone: string | null;
  waIdentity: string | null;
  channel: string;
  notes: string | null;
  ficha: Record<string, unknown> | null;
  createdAt: string;
};

export type ExportLead = {
  id: string;
  contactId: string;
  stage: string;
  amountCents: number | null;
  currency: string | null;
  priority: string | null;
  createdAt: string;
};

export type ExportMessage = {
  id: string;
  conversationId: string;
  direction: string;
  type: string;
  text: string | null;
  status: string;
  waTimestamp: string | null;
};

export type ExportConversation = {
  id: string;
  contactId: string;
  channel: string;
  aiEnabled: boolean;
  handoffReason: string | null;
  createdAt: string;
  messages: ExportMessage[];
};

export type ExportBooking = {
  id: string;
  conversationId: string | null;
  kind: string;
  scheduledAt: string;
  status: string;
  createdAt: string;
};

export type ExportRun = {
  id: string;
  status: string;
  score: number | null;
  startedAt: string;
  finishedAt: string | null;
};

export type OrganizationExport = {
  exportedAt: string;
  version: number;
  stages: { id: string; name: string; position: number }[];
  contacts: ExportContact[];
  leads: ExportLead[];
  conversations: ExportConversation[];
  bookings: ExportBooking[];
  labRuns: ExportRun[];
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Construye el dump completo de la organización. Solo lectura. */
export async function buildOrganizationExport(
  organizationId: string
): Promise<OrganizationExport> {
  const db = getDb();

  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  const contacts = await db
    .select()
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId))
    .orderBy(asc(schema.contact.createdAt));

  // Los contactos sintéticos del Laboratorio viajan ARCHIVADOS y con teléfono
  // prefijado; se excluyen aquí para no entregar datos de prueba como si
  // fueran del negocio.
  const realContacts = contacts.filter((c) => !c.archivedAt);

  const leads = await db
    .select()
    .from(schema.lead)
    .where(scoped(schema.lead.organizationId, organizationId))
    .orderBy(asc(schema.lead.createdAt));

  const conversations = await db
    .select()
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId))
    .orderBy(asc(schema.conversation.createdAt));

  const realConversations = conversations.filter((c) => !c.isTest);

  const messages = realConversations.length
    ? await db
        .select()
        .from(schema.message)
        .where(
          inArray(
            schema.message.conversationId,
            realConversations.map((c) => c.id)
          )
        )
        .orderBy(asc(schema.message.createdAt))
    : [];

  const bookings = await db
    .select()
    .from(schema.booking)
    .where(scoped(schema.booking.organizationId, organizationId))
    .orderBy(asc(schema.booking.createdAt));

  const labRuns = await db
    .select()
    .from(schema.agentTestRun)
    .where(scoped(schema.agentTestRun.organizationId, organizationId))
    .orderBy(asc(schema.agentTestRun.startedAt));

  const stageName = new Map(stages.map((s) => [s.id, s.name]));

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
    })),
    contacts: realContacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      waIdentity: c.waIdentity,
      channel: c.channel,
      notes: c.notes,
      ficha: c.ficha,
      createdAt: c.createdAt.toISOString(),
    })),
    leads: leads.map((l) => ({
      id: l.id,
      contactId: l.contactId,
      stage: stageName.get(l.stageId) ?? l.stageId,
      amountCents: l.amountCents,
      currency: l.currency,
      priority: l.priority,
      createdAt: l.createdAt.toISOString(),
    })),
    conversations: realConversations.map((c) => ({
      id: c.id,
      contactId: c.contactId,
      channel: c.channel,
      aiEnabled: c.aiEnabled,
      handoffReason: c.handoffReason,
      createdAt: c.createdAt.toISOString(),
      messages: messages
        .filter((m) => m.conversationId === c.id)
        .map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          direction: m.direction,
          type: m.type,
          text: m.text,
          status: m.status,
          waTimestamp: iso(m.waTimestamp),
        })),
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      conversationId: b.conversationId,
      kind: b.kind,
      scheduledAt: b.scheduledAt.toISOString(),
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    })),
    labRuns: labRuns.map((r) => ({
      id: r.id,
      status: r.status,
      score: r.score,
      startedAt: r.startedAt.toISOString(),
      finishedAt: iso(r.finishedAt),
    })),
  };
}
