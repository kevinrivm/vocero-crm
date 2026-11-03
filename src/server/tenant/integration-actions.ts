"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import { zernioConnectionsOfOrg } from "@/server/zernio/conexiones";
import { getEvolutionQrCode, checkEvolutionInstance } from "@/server/evolution/client";
import type { IntegrationsViewData, TenantChannelItem } from "@/lib/integrations-types";

function generateSecureKey(): string {
  return "nxa_" + randomBytes(24).toString("hex");
}

/**
 * Obtiene los datos consolidados del Centro de Integraciones del Tenant.
 */
export async function getIntegrationsData(): Promise<IntegrationsViewData> {
  const session = await requireSession();
  const db = getDb();

  const [org] = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      dispatchWebhookUrl: schema.organization.dispatchWebhookUrl,
      botApiKey: schema.organization.botApiKey,
      evoUrl: schema.organization.evoUrl,
      evoInstance: schema.organization.evoInstance,
      evoApiKey: schema.organization.evoApiKey,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  if (!org) {
    throw new Error("Organización no encontrada");
  }

  let botApiKey = org.botApiKey;
  // Si no tiene botApiKey configurada, generamos una por defecto y la persistimos
  if (!botApiKey || botApiKey.trim().length < 16) {
    botApiKey = generateSecureKey();
    await db
      .update(schema.organization)
      .set({ botApiKey })
      .where(eq(schema.organization.id, session.organizationId));
  }

  // Consultar las líneas multicanal del tenant
  const rawChannels = await db
    .select()
    .from(schema.tenantChannels)
    .where(scoped(schema.tenantChannels.organizationId, session.organizationId))
    .orderBy(desc(schema.tenantChannels.createdAt));

  const channels: TenantChannelItem[] = rawChannels.map((c) => ({
    id: c.id,
    name: c.name,
    platform: c.platform as "whatsapp" | "evolution",
    providerId: c.providerId,
    token: c.token,
    enableAi: c.enableAi,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
  }));

  // Consultar estado de WhatsApp Cloud API heredado
  const waCreds = await getCredentialsByOrg(session.organizationId);

  // Consultar estado de Zernio (Redes Sociales)
  let zernioAccountCount = 0;
  try {
    const zernioConns = await zernioConnectionsOfOrg(session.organizationId);
    zernioAccountCount = zernioConns.length;
  } catch {
    // Sin conexiones Zernio
  }

  return {
    organizationId: org.id,
    organizationName: org.name,
    dispatchWebhookUrl: org.dispatchWebhookUrl ?? "",
    botApiKey: botApiKey,
    evoUrl: org.evoUrl ?? "",
    evoInstance: org.evoInstance ?? "",
    evoApiKey: org.evoApiKey ?? "",
    channels,
    whatsapp: {
      connected: Boolean(waCreds && waCreds.status === "connected"),
      displayPhoneNumber: waCreds?.displayPhoneNumber ?? null,
      verifiedName: waCreds?.verifiedName ?? null,
      wabaId: waCreds?.wabaId ?? null,
      status: waCreds?.status ?? null,
    },
    zernio: {
      connected: zernioAccountCount > 0,
      accountCount: zernioAccountCount,
    },
  };
}

/**
 * Conecta una nueva línea telefónica / canal al tenant (Multilínea 1:N).
 */
export async function createTenantChannel(input: {
  platform: "whatsapp" | "evolution";
  name: string;
  providerId: string;
  token?: string;
  enableAi: boolean;
}): Promise<{ success: boolean; message: string; channel?: TenantChannelItem }> {
  const session = await requireSession();
  const db = getDb();

  const trimmedName = input.name.trim();
  const trimmedProvider = input.providerId.trim();
  const trimmedToken = input.token?.trim() || null;

  if (!trimmedName) {
    return { success: false, message: "El nombre de la línea es obligatorio" };
  }
  if (!trimmedProvider) {
    return {
      success: false,
      message:
        input.platform === "whatsapp"
          ? "El Phone Number ID es obligatorio"
          : "El Nombre de la Instancia de Evolution es obligatorio",
    };
  }

  const id = newId("tenantChannel");

  const [inserted] = await db
    .insert(schema.tenantChannels)
    .values({
      id,
      tenantId: session.organizationId,
      organizationId: session.organizationId,
      platform: input.platform,
      providerId: trimmedProvider,
      token: trimmedToken,
      name: trimmedName,
      enableAi: input.enableAi,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!inserted) {
    return { success: false, message: "No se pudo registrar la línea" };
  }

  revalidatePath("/integrations");
  revalidatePath("/ai-agent");

  return {
    success: true,
    message: `Línea «${inserted.name}» conectada exitosamente`,
    channel: {
      id: inserted.id,
      name: inserted.name,
      platform: inserted.platform as "whatsapp" | "evolution",
      providerId: inserted.providerId,
      token: inserted.token,
      enableAi: inserted.enableAi,
      status: inserted.status,
      createdAt: inserted.createdAt.toISOString(),
    },
  };
}

/**
 * Activa o desactiva el cortafuegos del Agente IA en una línea específica.
 */
export async function toggleChannelAi(
  channelId: string,
  enableAi: boolean
): Promise<{ success: boolean; message: string }> {
  const session = await requireSession();
  const db = getDb();

  const [updated] = await db
    .update(schema.tenantChannels)
    .set({
      enableAi,
      updatedAt: new Date(),
    })
    .where(
      and(
        scoped(schema.tenantChannels.organizationId, session.organizationId),
        eq(schema.tenantChannels.id, channelId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, message: "Línea no encontrada" };
  }

  revalidatePath("/integrations");
  return {
    success: true,
    message: enableAi
      ? `Agente IA activado para «${updated.name}»`
      : `Agente IA pausado para «${updated.name}» (solo atención humana)`,
  };
}

/**
 * Elimina o desconecta una línea del tenant.
 */
export async function deleteTenantChannel(
  channelId: string
): Promise<{ success: boolean; message: string }> {
  const session = await requireSession();
  const db = getDb();

  const [deleted] = await db
    .delete(schema.tenantChannels)
    .where(
      and(
        scoped(schema.tenantChannels.organizationId, session.organizationId),
        eq(schema.tenantChannels.id, channelId)
      )
    )
    .returning();

  if (!deleted) {
    return { success: false, message: "Línea no encontrada" };
  }

  revalidatePath("/integrations");
  revalidatePath("/ai-agent");
  return { success: true, message: `Línea «${deleted.name}» desconectada correctamente` };
}

/**
 * Guarda o actualiza la URL del webhook de despacho del tenant.
 */
export async function saveDispatchConfig(input: {
  dispatchWebhookUrl: string;
}): Promise<{ success: boolean; message: string }> {
  const session = await requireSession();
  const db = getDb();

  const trimmed = input.dispatchWebhookUrl.trim();

  if (trimmed) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { success: false, message: "La URL debe comenzar con http:// o https://" };
      }
    } catch {
      return { success: false, message: "Ingresa una URL válida" };
    }
  }

  await db
    .update(schema.organization)
    .set({ dispatchWebhookUrl: trimmed || null })
    .where(eq(schema.organization.id, session.organizationId));

  revalidatePath("/integrations");
  return { success: true, message: "Configuración de despacho guardada correctamente" };
}

/**
 * Regenera la Bot API Key del Tenant.
 */
export async function regenerateBotApiKey(): Promise<{
  success: boolean;
  botApiKey: string;
  message: string;
}> {
  const session = await requireSession();
  const db = getDb();

  const newKey = generateSecureKey();

  await db
    .update(schema.organization)
    .set({ botApiKey: newKey })
    .where(eq(schema.organization.id, session.organizationId));

  revalidatePath("/integrations");
  return {
    success: true,
    botApiKey: newKey,
    message: "Nueva API Key generada exitosamente",
  };
}

/**
 * Guarda la configuración de Evolution API para el tenant.
 */
export async function saveEvolutionConfig(input: {
  evoUrl: string;
  evoInstance: string;
  evoApiKey: string;
}): Promise<{ success: boolean; message: string }> {
  const session = await requireSession();
  const db = getDb();

  const trimmedUrl = input.evoUrl.trim();
  const trimmedInstance = input.evoInstance.trim();
  const trimmedKey = input.evoApiKey.trim();

  if (trimmedUrl) {
    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { success: false, message: "La URL de Evolution API debe ser http:// o https://" };
      }
    } catch {
      return { success: false, message: "URL de Evolution API inválida" };
    }
  }

  await db
    .update(schema.organization)
    .set({
      evoUrl: trimmedUrl || null,
      evoInstance: trimmedInstance || null,
      evoApiKey: trimmedKey || null,
    })
    .where(eq(schema.organization.id, session.organizationId));

  revalidatePath("/integrations");
  return { success: true, message: "Configuración de Evolution API guardada exitosamente" };
}

/**
 * Solicita el código QR para escanear en WhatsApp a través de Evolution API.
 */
export async function getEvolutionQrAction(input: {
  evoUrl?: string;
  instanceName: string;
  evoApiKey?: string;
}): Promise<{
  success: boolean;
  qrCode?: string;
  pairingCode?: string | null;
  state?: string;
  message?: string;
  error?: string;
}> {
  const session = await requireSession();
  const db = getDb();

  const [org] = await db
    .select({
      evoUrl: schema.organization.evoUrl,
      evoApiKey: schema.organization.evoApiKey,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  const effectiveUrl =
    input.evoUrl?.trim() ||
    org?.evoUrl?.trim() ||
    process.env.EVOLUTION_API_URL?.trim() ||
    "http://localhost:8080";

  const effectiveKey =
    input.evoApiKey?.trim() ||
    org?.evoApiKey?.trim() ||
    process.env.EVOLUTION_API_KEY?.trim() ||
    "";

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const webhookUrl = `${appBaseUrl.replace(/\/+$/, "")}/api/webhooks/evolution/${session.organizationId}`;

  // Si se pasaron valores en el input y la org no los tenía, actualizarlos
  if (input.evoUrl?.trim() && (!org?.evoUrl || input.evoUrl.trim() !== org.evoUrl)) {
    await db
      .update(schema.organization)
      .set({
        evoUrl: input.evoUrl.trim(),
        ...(input.evoApiKey?.trim() ? { evoApiKey: input.evoApiKey.trim() } : {}),
      })
      .where(eq(schema.organization.id, session.organizationId));
  }

  return await getEvolutionQrCode({
    evoUrl: effectiveUrl,
    instanceName: input.instanceName,
    evoApiKey: effectiveKey,
    webhookUrl,
  });
}

/**
 * Consulta el estado de conexión de la instancia de Evolution API (sondeo).
 */
export async function checkEvolutionStatusAction(input: {
  evoUrl?: string;
  instanceName: string;
  evoApiKey?: string;
}): Promise<{ connected: boolean; state: string }> {
  const session = await requireSession();
  const db = getDb();

  const [org] = await db
    .select({
      evoUrl: schema.organization.evoUrl,
      evoApiKey: schema.organization.evoApiKey,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);

  const effectiveUrl =
    input.evoUrl?.trim() ||
    org?.evoUrl?.trim() ||
    process.env.EVOLUTION_API_URL?.trim() ||
    "http://localhost:8080";

  const effectiveKey =
    input.evoApiKey?.trim() ||
    org?.evoApiKey?.trim() ||
    process.env.EVOLUTION_API_KEY?.trim() ||
    "";

  return await checkEvolutionInstance({
    evoUrl: effectiveUrl,
    evoInstance: input.instanceName,
    evoApiKey: effectiveKey,
  });
}
