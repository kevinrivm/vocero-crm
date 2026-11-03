"use server";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { CRM_PRESET_COLORS } from "@/lib/crm-colors";
import { moveLeadToStage } from "@/server/leads/stage-history";
import { sendText } from "@/server/inbox/send";
import { isWindowOpen, windowRemainingMs } from "@/server/inbox/window";
import { windowMsFor } from "@/server/channels/capabilities";
import type {
  InboxAgent,
  InboxContactTag,
  InboxConversationItem,
  InboxMessageItem,
  InboxStage,
  InboxViewData,
} from "@/lib/inbox-types";

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
 * Carga los datos iniciales completos para la bandeja de entrada multi-tenant.
 */
export async function getInboxData(): Promise<InboxViewData> {
  const session = await requireSession();
  const db = getDb();

  // 1. Consultar organización actual y su metadata
  const [org] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      metadata: schema.organization.metadata,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const meta = parseMetadata(org.metadata);
  const stageColors = meta.stageColors || {};
  const tagsList = meta.tags || [];

  // 2. Consultar etapas del embudo
  const stageRows = await db
    .select({
      id: schema.pipelineStage.id,
      name: schema.pipelineStage.name,
      kind: schema.pipelineStage.kind,
      position: schema.pipelineStage.position,
    })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  const stages: InboxStage[] = stageRows.map((s, idx) => {
    let color = "#0F4C5C";
    if (s.kind === "won") color = "#10B981";
    if (s.kind === "lost") color = "#EF4444";
    const custom =
      stageColors[s.id] ||
      CRM_PRESET_COLORS[idx % CRM_PRESET_COLORS.length]?.hex ||
      color;
    return {
      id: s.id,
      name: s.name,
      color: s.kind === "won" ? "#10B981" : s.kind === "lost" ? "#EF4444" : custom,
      kind: s.kind,
    };
  });

  const stageMap = new Map(stages.map((s) => [s.id, s]));

  // 3. Catálogo de etiquetas
  const tags: InboxContactTag[] = tagsList.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
  }));
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  // 4. Agentes de la organización
  const memberRows = await db
    .select({
      userId: schema.member.userId,
      role: schema.member.role,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.member.organizationId, session.organizationId));

  const agents: InboxAgent[] = memberRows.map((m) => ({
    id: m.userId,
    name: m.name || m.email.split("@")[0] || "Asesor",
    email: m.email,
  }));
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // 5. Consultar conversaciones con contacto y lead vinculado
  const convRows = await db
    .select({
      conversationId: schema.conversation.id,
      channel: schema.conversation.channel,
      aiEnabled: schema.conversation.aiEnabled,
      handoffAt: schema.conversation.handoffAt,
      lastInboundAt: schema.conversation.lastInboundAt,
      lastMessageAt: schema.conversation.lastMessageAt,
      unreadCount: schema.conversation.unreadCount,
      contactId: schema.contact.id,
      contactName: schema.contact.name,
      contactPhone: schema.contact.phone,
      contactWaIdentity: schema.contact.waIdentity,
      contactNotes: schema.contact.notes,
      contactFicha: schema.contact.ficha,
      contactCreatedAt: schema.contact.createdAt,
      leadStageId: schema.lead.stageId,
      preview: sql<string | null>`(
        select coalesce(m.text, m.type)
        from message m
        where m.organization_id = ${schema.conversation.organizationId}
          and m.conversation_id = ${schema.conversation.id}
        order by m.created_at desc
        limit 1
      )`,
    })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      and(
        eq(schema.contact.id, schema.conversation.contactId),
        eq(schema.contact.organizationId, session.organizationId)
      )
    )
    .leftJoin(
      schema.lead,
      and(
        eq(schema.lead.contactId, schema.contact.id),
        eq(schema.lead.organizationId, session.organizationId)
      )
    )
    .where(
      and(
        eq(schema.conversation.organizationId, session.organizationId),
        eq(schema.conversation.isTest, false)
      )
    )
    .orderBy(desc(schema.conversation.lastMessageAt));

  const conversations: InboxConversationItem[] = convRows.map((row) => {
    const ficha = row.contactFicha as Record<string, unknown> | null;
    const tagIds = Array.isArray(ficha?.tags) ? (ficha.tags as string[]) : [];
    const resolvedTags = tagIds
      .map((tid) => tagMap.get(tid))
      .filter((t): t is InboxContactTag => Boolean(t));

    const assignedAgentId =
      typeof ficha?.assignedAgentId === "string" ? ficha.assignedAgentId : null;
    const resolvedAgent = assignedAgentId ? agentMap.get(assignedAgentId) ?? null : null;

    const resolvedStage = row.leadStageId ? stageMap.get(row.leadStageId) ?? null : null;

    const channelName = (row.channel || "whatsapp") as any;
    const windowMaxMs = windowMsFor(channelName);
    const windowOpen = isWindowOpen(row.lastInboundAt, new Date(), windowMaxMs);
    const remainingMs = windowRemainingMs(row.lastInboundAt, new Date(), windowMaxMs);

    let status: "open" | "closed" | "pending" = "open";
    if (resolvedStage?.kind === "won" || resolvedStage?.kind === "lost") {
      status = "closed";
    } else if (row.unreadCount > 0) {
      status = "pending";
    }

    return {
      id: row.conversationId,
      channel: row.channel || "whatsapp",
      status,
      unreadCount: row.unreadCount ?? 0,
      lastMessageText: row.preview ?? null,
      lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
      windowOpen,
      windowRemainingMs: remainingMs,
      aiEnabled: row.aiEnabled ?? true,
      handoffAt: row.handoffAt ? row.handoffAt.toISOString() : null,
      contact: {
        id: row.contactId,
        name: row.contactName,
        phone: row.contactPhone,
        waIdentity: row.contactWaIdentity,
        notes: row.contactNotes,
        tags: resolvedTags,
        stage: resolvedStage,
        assignedAgent: resolvedAgent,
        createdAt: row.contactCreatedAt.toISOString(),
      },
    };
  });

  return {
    organizationId: org.id,
    organizationName: org.name,
    conversations,
    stages,
    tags,
    agents,
  };
}

/**
 * Consulta los mensajes de una conversación específica.
 */
export async function getConversationMessages(
  conversationId: string
): Promise<InboxMessageItem[]> {
  const session = await requireSession();
  const db = getDb();

  const rows = await db
    .select({
      id: schema.message.id,
      conversationId: schema.message.conversationId,
      direction: schema.message.direction,
      type: schema.message.type,
      text: schema.message.text,
      status: schema.message.status,
      error: schema.message.error,
      aiGenerated: schema.message.aiGenerated,
      createdAt: schema.message.createdAt,
    })
    .from(schema.message)
    .where(
      and(
        eq(schema.message.organizationId, session.organizationId),
        eq(schema.message.conversationId, conversationId)
      )
    )
    .orderBy(asc(schema.message.createdAt));

  // Marcar como leídos al abrir
  await db
    .update(schema.conversation)
    .set({ unreadCount: 0 })
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        eq(schema.conversation.organizationId, session.organizationId)
      )
    );

  return rows.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction as "in" | "out",
    type: m.type,
    text: m.text,
    status: (m.status as InboxMessageItem["status"]) || "delivered",
    error: m.error,
    aiGenerated: m.aiGenerated ?? false,
    createdAt: m.createdAt.toISOString(),
  }));
}

/**
 * Mueve el contacto/lead a una nueva etapa del embudo.
 */
export async function updateContactStageAction(data: {
  contactId: string;
  stageId: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const db = getDb();

  const [leadRow] = await db
    .select({ id: schema.lead.id })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, session.organizationId),
        eq(schema.lead.contactId, data.contactId)
      )
    )
    .limit(1);

  if (!leadRow) {
    return { success: false, error: "Prospecto no encontrado en el embudo" };
  }

  const res = await moveLeadToStage({
    organizationId: session.organizationId,
    leadId: leadRow.id,
    toStageId: data.stageId,
    actorUserId: session.userId,
    source: "dueno",
  });

  if (!res.ok) {
    return { success: false, error: "No se pudo actualizar la etapa" };
  }

  revalidatePath("/inbox");
  return { success: true };
}

/**
 * Actualiza las etiquetas asignadas al contacto.
 */
export async function updateContactTagsAction(data: {
  contactId: string;
  tagIds: string[];
}): Promise<{ success: boolean }> {
  const session = await requireSession();
  const db = getDb();

  const [contactRow] = await db
    .select({ ficha: schema.contact.ficha })
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, session.organizationId),
        eq(schema.contact.id, data.contactId)
      )
    )
    .limit(1);

  if (!contactRow) {
    return { success: false };
  }

  const existingFicha = (contactRow.ficha as Record<string, unknown>) || {};
  const updatedFicha = {
    ...existingFicha,
    tags: data.tagIds,
  };

  await db
    .update(schema.contact)
    .set({ ficha: updatedFicha })
    .where(
      and(
        eq(schema.contact.organizationId, session.organizationId),
        eq(schema.contact.id, data.contactId)
      )
    );

  revalidatePath("/inbox");
  return { success: true };
}

/**
 * Pausa o reanuda la IA / transfiere a humano en una conversación.
 */
export async function toggleAiHandoffAction(data: {
  conversationId: string;
  aiEnabled: boolean;
}): Promise<{ success: boolean }> {
  const session = await requireSession();
  const db = getDb();

  await db
    .update(schema.conversation)
    .set({
      aiEnabled: data.aiEnabled,
      handoffAt: data.aiEnabled ? null : new Date(),
      handoffReason: data.aiEnabled ? null : "manual_reply",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.conversation.organizationId, session.organizationId),
        eq(schema.conversation.id, data.conversationId)
      )
    );

  revalidatePath("/inbox");
  return { success: true };
}

/**
 * Envía un mensaje de texto en la conversación.
 */
export async function sendInboxMessageAction(data: {
  conversationId: string;
  text: string;
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const session = await requireSession();

  try {
    const res = await sendText({
      conversationId: data.conversationId,
      organizationId: session.organizationId,
      text: data.text,
      aiGenerated: false,
    });

    revalidatePath("/inbox");
    return { success: true, messageId: res.messageId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al enviar mensaje",
    };
  }
}

