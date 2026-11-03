"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeMx } from "@/lib/meta/client";
import { createLeadForContact } from "@/server/inbox/lead-activity";
import { CRM_PRESET_COLORS } from "@/lib/crm-colors";

export type TenantContact = {
  id: string;
  name: string;
  phone: string | null;
  waIdentity: string;
  stage: {
    id: string;
    name: string;
    color: string;
  } | null;
  tags: {
    id: string;
    name: string;
    color: string;
  }[];
  assignedAgent: {
    id: string;
    name: string;
  } | null;
  notes: string | null;
  createdAt: string;
};

export type ContactsViewData = {
  contacts: TenantContact[];
  stages: { id: string; name: string; color: string }[];
  tags: { id: string; name: string; color: string }[];
  agents: { id: string; name: string; email: string }[];
};

interface OrgMetadataJson {
  stageColors?: Record<string, string>;
  tags?: { id: string; name: string; color: string; createdAt: string }[];
  [key: string]: unknown;
}

function parseMetadata(raw: string | null | undefined): OrgMetadataJson {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as OrgMetadataJson;
  } catch {
    return {};
  }
}

/**
 * Consulta la base de contactos centralizada del tenant actual,
 * junto con las etapas del CRM, las etiquetas y los agentes asignables.
 */
export async function getContactsData(): Promise<ContactsViewData> {
  const session = await requireSession();
  const db = getDb();

  // 1. Consultar etapas del pipeline de esta empresa
  const stageRows = await db
    .select({
      id: schema.pipelineStage.id,
      name: schema.pipelineStage.name,
      kind: schema.pipelineStage.kind,
      position: schema.pipelineStage.position,
    })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId));

  // 2. Consultar metadata de la organización para colores de etapas y catálogo de etiquetas
  const [org] = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  const meta = parseMetadata(org?.metadata);
  const stageColors = meta.stageColors || {};
  const tagsList = meta.tags || [];

  const stages = stageRows.map((s, idx) => {
    let color = "#0F4C5C";
    if (s.kind === "won") color = "#10B981";
    if (s.kind === "lost") color = "#EF4444";
    const custom = stageColors[s.id] || CRM_PRESET_COLORS[idx % CRM_PRESET_COLORS.length]?.hex || color;
    return {
      id: s.id,
      name: s.name,
      color: s.kind === "won" ? "#10B981" : s.kind === "lost" ? "#EF4444" : custom,
    };
  });

  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const tagMap = new Map(
    tagsList.map((t) => [t.id, { id: t.id, name: t.name, color: t.color }])
  );

  // 3. Consultar agentes/miembros asignables de la empresa
  const agentRows = await db
    .select({
      userId: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, session.organizationId));

  const agents = agentRows.map((a) => ({
    id: a.userId,
    name: a.name,
    email: a.email,
  }));
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // 4. Consultar leads de la empresa para resolver la etapa de cada contacto
  const leadRows = await db
    .select({
      contactId: schema.lead.contactId,
      stageId: schema.lead.stageId,
    })
    .from(schema.lead)
    .where(scoped(schema.lead.organizationId, session.organizationId));

  const contactStageMap = new Map(leadRows.map((l) => [l.contactId, l.stageId]));

  // 5. Consultar contactos de la empresa
  const contactRows = await db
    .select()
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, session.organizationId))
    .orderBy(desc(schema.contact.createdAt));

  const contacts: TenantContact[] = contactRows.map((c) => {
    const stageId = contactStageMap.get(c.id);
    const resolvedStage = stageId ? stageMap.get(stageId) || null : null;

    // Ficha puede contener etiquetas y agente asignado
    const ficha = (c.ficha || {}) as Record<string, unknown>;
    const tagIds = Array.isArray(ficha.tags) ? (ficha.tags as string[]) : [];
    const assignedAgentId = (ficha.assignedAgentId as string) || (ficha.assignedTo as string) || null;

    const resolvedTags = tagIds
      .map((tid) => tagMap.get(tid))
      .filter((t): t is { id: string; name: string; color: string } => Boolean(t));

    const resolvedAgent = assignedAgentId
      ? agentMap.get(assignedAgentId)
        ? { id: assignedAgentId, name: agentMap.get(assignedAgentId)!.name }
        : null
      : null;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      waIdentity: c.waIdentity,
      stage: resolvedStage,
      tags: resolvedTags,
      assignedAgent: resolvedAgent,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return {
    contacts,
    stages,
    tags: tagsList.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    agents,
  };
}

/**
 * Acción de Servidor para crear un nuevo contacto manualmente en la compañía.
 * Candado de seguridad: filtra y registra estrictamente con el organizationId del tenant activo.
 */
export async function createContact(data: {
  name: string;
  phone: string;
  stageId?: string;
  tagIds?: string[];
  assignedAgentId?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const cleanName = data.name.trim();
  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: "El nombre debe tener al menos 2 caracteres" };
  }

  // Limpiar dígitos de teléfono
  const rawDigits = data.phone.replace(/\D/g, "");
  if (rawDigits.length < 8) {
    return { success: false, error: "Ingresa un número telefónico válido con código de país" };
  }

  const normalizedPhone = normalizeMx(rawDigits);
  const db = getDb();

  // Comprobar si ya existe un contacto con este número en la organización actual
  const [existing] = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, session.organizationId),
        eq(schema.contact.waIdentity, normalizedPhone)
      )
    )
    .limit(1);

  if (existing) {
    return {
      success: false,
      error: "Ya existe un contacto registrado con este número telefónico en tu empresa",
    };
  }

  const contactId = newId("contact");
  const fichaPayload: Record<string, unknown> = {
    tags: data.tagIds || [],
    assignedAgentId: data.assignedAgentId || null,
  };

  // 1. Insertar contacto vinculado estrictamente a session.organizationId
  await db.insert(schema.contact).values({
    id: contactId,
    organizationId: session.organizationId,
    channel: "whatsapp",
    name: cleanName,
    phone: normalizedPhone,
    waIdentity: normalizedPhone,
    nameSource: "manual",
    notes: data.notes?.trim() || null,
    ficha: fichaPayload,
  });

  // 2. Crear lead en el embudo comercial (etapa seleccionada o primera abierta)
  try {
    await createLeadForContact({
      organizationId: session.organizationId,
      contactId,
      stageId: data.stageId,
      source: "dueno",
      at: new Date(),
    });
  } catch {
    // Si no hay etapas en el pipeline no interrumpe la creación del contacto
  }

  revalidatePath("/contacts");
  revalidatePath("/pipeline");

  return { success: true };
}

/**
 * Elimina a un contacto garantizando que pertenece exclusivamente a la organización activa.
 */
export async function deleteContact(contactId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const db = getDb();

  // DELETE filtrado estrictamente por organizationId
  await db
    .delete(schema.contact)
    .where(
      and(
        eq(schema.contact.id, contactId),
        eq(schema.contact.organizationId, session.organizationId)
      )
    );

  revalidatePath("/contacts");
  revalidatePath("/pipeline");

  return { success: true };
}
