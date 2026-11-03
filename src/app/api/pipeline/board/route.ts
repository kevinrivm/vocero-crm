import { and, asc, eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { newId } from "@/lib/db/ids";
import { getBranding } from "@/server/branding";
import { SEED_STAGES } from "@/server/auth/on-signup";
import { createLeadForContact } from "@/server/inbox/lead-activity";

export const dynamic = "force-dynamic";

/** Datos completos del kanban: etapas ordenadas + tarjetas con su contacto. */
export const GET = withAuth(async (session) => {
  const db = getDb();

  let stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  // Si la organización no tiene etapas aún, sembrar las predeterminadas
  if (stages.length === 0) {
    const seedValues = SEED_STAGES.map((s, i) => ({
      id: newId("stage"),
      organizationId: session.organizationId,
      name: s.name,
      position: i,
      kind: s.kind,
    }));
    await db.insert(schema.pipelineStage).values(seedValues);
    stages = await db
      .select()
      .from(schema.pipelineStage)
      .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
      .orderBy(asc(schema.pipelineStage.position));
  }

  // Asegurar que todo contacto existente de la organización cuente con su tarjeta (lead) en el pipeline
  const contactsWithoutLead = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .leftJoin(schema.lead, eq(schema.contact.id, schema.lead.contactId))
    .where(
      and(
        scoped(schema.contact.organizationId, session.organizationId),
        sql`${schema.lead.id} IS NULL`
      )
    );

  if (contactsWithoutLead.length > 0 && stages.length > 0) {
    const firstOpenStage = stages.find((s) => s.kind === "open") ?? stages[0];
    for (const c of contactsWithoutLead) {
      await createLeadForContact({
        organizationId: session.organizationId,
        contactId: c.id,
        stageId: firstOpenStage?.id,
      });
    }
  }

  const leads = await db
    .select({
      lead: schema.lead,
      contact: schema.contact,
      conversationId: schema.conversation.id,
    })
    .from(schema.lead)
    .innerJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
    .leftJoin(
      schema.conversation,
      and(
        eq(schema.conversation.contactId, schema.contact.id),
        eq(schema.conversation.isTest, false)
      )
    )
    .where(scoped(schema.lead.organizationId, session.organizationId))
    .orderBy(asc(schema.lead.position));

  // La moneda del negocio viaja con el tablero: el cliente suma sus columnas y
  // necesita saber cuál es la única sumable, sin adivinarla ni pedirla aparte.
  const { currency } = await getBranding(session.organizationId);

  return Response.json({
    currency,
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      kind: s.kind,
    })),
    leads: leads.map((r) => ({
      id: r.lead.id,
      stageId: r.lead.stageId,
      position: r.lead.position,
      lastActivityAt: r.lead.lastActivityAt?.toISOString() ?? null,
      amountCents: r.lead.amountCents,
      currency: r.lead.currency,
      priority: r.lead.priority,
      contact: {
        id: r.contact.id,
        name: r.contact.name,
        phone: r.contact.phone,
      },
      conversationId: r.conversationId,
    })),
  });
});
