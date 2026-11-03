"use server";

import { and, asc, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { CRM_PRESET_COLORS } from "@/lib/crm-colors";
import { relocateLeadsFromStage } from "@/server/leads/stage-history";

export type CrmStage = {
  id: string;
  name: string;
  position: number;
  kind: "open" | "won" | "lost";
  color: string;
  createdAt: string;
};

export type CrmTag = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

export type CrmSettingsData = {
  stages: CrmStage[];
  tags: CrmTag[];
  organizationName: string;
};

interface OrgMetadataJson {
  stageColors?: Record<string, string>;
  tags?: CrmTag[];
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
 * Consulta la configuración de embudos de venta (etapas) y etiquetas
 * vinculadas exclusivamente a la compañía de la sesión actual.
 */
export async function getCrmSettingsData(): Promise<CrmSettingsData> {
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
  const tags = meta.tags || [];

  // 2. Consultar etapas del pipeline de esta empresa
  const stageRows = await db
    .select({
      id: schema.pipelineStage.id,
      name: schema.pipelineStage.name,
      position: schema.pipelineStage.position,
      kind: schema.pipelineStage.kind,
      createdAt: schema.pipelineStage.createdAt,
    })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  // Asignar colores por defecto o guardados
  const stages: CrmStage[] = stageRows.map((s, idx) => {
    let defaultColor = "#0F4C5C";
    if (s.kind === "won") defaultColor = "#10B981"; // Esmeralda
    if (s.kind === "lost") defaultColor = "#EF4444"; // Rojo
    const savedColor = stageColors[s.id] || CRM_PRESET_COLORS[idx % CRM_PRESET_COLORS.length]?.hex || defaultColor;

    return {
      id: s.id,
      name: s.name,
      position: s.position,
      kind: (s.kind as "open" | "won" | "lost") || "open",
      color: s.kind === "won" ? "#10B981" : s.kind === "lost" ? "#EF4444" : savedColor,
      createdAt: s.createdAt.toISOString(),
    };
  });

  return {
    stages,
    tags,
    organizationName: org.name,
  };
}

/**
 * Crea una nueva etapa en el embudo de ventas vinculada estrictamente al tenantId.
 */
export async function createStage(data: {
  name: string;
  color?: string;
}): Promise<{ success: boolean; error?: string; stage?: CrmStage }> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return { success: false, error: "Permiso denegado" };
  }

  const cleanName = data.name.trim();
  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: "El nombre de la etapa debe tener al menos 2 caracteres" };
  }

  const cleanColor = data.color || "#0F4C5C";
  const db = getDb();

  // Obtener la posición máxima actual para colocarla al final
  const [maxPos] = await db
    .select({
      max: sql<number>`coalesce(max(${schema.pipelineStage.position}), -1)`,
    })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId));

  const nextPos = (maxPos?.max ?? -1) + 1;
  const stageId = newId("stage");

  // INSERT estricto con organizationId = session.organizationId
  await db.insert(schema.pipelineStage).values({
    id: stageId,
    organizationId: session.organizationId,
    name: cleanName,
    position: nextPos,
    kind: "open",
  });

  // Guardar color en metadata de la organización
  const [org] = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  const meta = parseMetadata(org?.metadata);
  const stageColors = meta.stageColors || {};
  stageColors[stageId] = cleanColor;
  meta.stageColors = stageColors;

  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, session.organizationId));

  revalidatePath("/crm-settings");
  revalidatePath("/pipeline");

  return {
    success: true,
    stage: {
      id: stageId,
      name: cleanName,
      position: nextPos,
      kind: "open",
      color: cleanColor,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Actualiza el orden de las etapas en el embudo de ventas.
 */
export async function updateStageOrder(
  orderedStages: { id: string; position: number }[]
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return { success: false, error: "Permiso denegado" };
  }

  const db = getDb();

  // Actualizar cada etapa asegurando pertenencia a la empresa
  for (const item of orderedStages) {
    await db
      .update(schema.pipelineStage)
      .set({ position: item.position })
      .where(
        and(
          eq(schema.pipelineStage.id, item.id),
          eq(schema.pipelineStage.organizationId, session.organizationId)
        )
      );
  }

  revalidatePath("/crm-settings");
  revalidatePath("/pipeline");

  return { success: true };
}

/**
 * Elimina una etapa del embudo de ventas vinculada estrictamente al tenantId actual.
 */
export async function deleteStage(stageId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return { success: false, error: "Permiso denegado" };
  }

  const db = getDb();

  // Buscar la etapa y verificar pertenencia al tenant
  const [stage] = await db
    .select()
    .from(schema.pipelineStage)
    .where(
      and(
        eq(schema.pipelineStage.id, stageId),
        eq(schema.pipelineStage.organizationId, session.organizationId)
      )
    )
    .limit(1);

  if (!stage) {
    return { success: false, error: "Etapa no encontrada en esta compañía" };
  }

  if (stage.kind !== "open") {
    return {
      success: false,
      error: "Las etapas ancla ('Ganado' y 'Perdido') son esenciales y no se pueden eliminar",
    };
  }

  // Comprobar si hay leads vinculados a esta etapa
  const [leadsRes] = await db
    .select({ count: count() })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.stageId, stageId),
        eq(schema.lead.organizationId, session.organizationId)
      )
    );

  if ((leadsRes?.count ?? 0) > 0) {
    // Reasignar los leads a la primera etapa abierta disponible
    const [fallbackStage] = await db
      .select({ id: schema.pipelineStage.id })
      .from(schema.pipelineStage)
      .where(
        and(
          eq(schema.pipelineStage.organizationId, session.organizationId),
          sql`${schema.pipelineStage.id} != ${stageId}`
        )
      )
      .orderBy(asc(schema.pipelineStage.position))
      .limit(1);

    if (fallbackStage) {
      await relocateLeadsFromStage({
        organizationId: session.organizationId,
        fromStageId: stageId,
        toStageId: fallbackStage.id,
        actorUserId: session.userId,
      });
    }
  }

  // DELETE con filtro estricto por organizationId
  await db
    .delete(schema.pipelineStage)
    .where(
      and(
        eq(schema.pipelineStage.id, stageId),
        eq(schema.pipelineStage.organizationId, session.organizationId)
      )
    );

  // Limpiar color en metadata
  const [org] = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  if (org) {
    const meta = parseMetadata(org.metadata);
    if (meta.stageColors) {
      delete meta.stageColors[stageId];
      await db
        .update(schema.organization)
        .set({ metadata: JSON.stringify(meta) })
        .where(eq(schema.organization.id, session.organizationId));
    }
  }

  revalidatePath("/crm-settings");
  revalidatePath("/pipeline");

  return { success: true };
}

/**
 * Crea una nueva etiqueta descriptiva para los contactos del negocio.
 */
export async function createTag(data: {
  name: string;
  color: string;
}): Promise<{ success: boolean; error?: string; tag?: CrmTag }> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return { success: false, error: "Permiso denegado" };
  }

  const cleanName = data.name.trim();
  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: "El nombre de la etiqueta debe tener al menos 2 caracteres" };
  }

  const cleanColor = data.color || "#0F4C5C";
  const db = getDb();

  const [org] = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  if (!org) {
    return { success: false, error: "Organización no encontrada" };
  }

  const meta = parseMetadata(org.metadata);
  const tags = meta.tags || [];

  // Evitar etiquetas duplicadas por nombre en la misma empresa
  if (tags.some((t) => t.name.toLowerCase() === cleanName.toLowerCase())) {
    return { success: false, error: "Ya existe una etiqueta con este nombre" };
  }

  const newTagItem: CrmTag = {
    id: newId("tag"),
    name: cleanName,
    color: cleanColor,
    createdAt: new Date().toISOString(),
  };

  tags.push(newTagItem);
  meta.tags = tags;

  // Actualizar estrictamente la organización del tenant actual
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, session.organizationId));

  revalidatePath("/crm-settings");

  return { success: true, tag: newTagItem };
}

/**
 * Elimina una etiqueta descriptiva garantizando que pertenece a la empresa actual.
 */
export async function deleteTag(tagId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  if (!canConfigure(session.role, session.userRole)) {
    return { success: false, error: "Permiso denegado" };
  }

  const db = getDb();

  const [org] = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  if (!org) {
    return { success: false, error: "Organización no encontrada" };
  }

  const meta = parseMetadata(org.metadata);
  const currentTags = meta.tags || [];
  const updatedTags = currentTags.filter((t) => t.id !== tagId);

  meta.tags = updatedTags;

  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, session.organizationId));

  revalidatePath("/crm-settings");

  return { success: true };
}

