import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { enabledChannels } from "@/server/channels/enabled";
import type { Channel } from "@/lib/channels";

/**
 * Consulta qué canales de mensajería están vinculados/activos para la organización:
 * - WhatsApp (Meta oficial o multilínea)
 * - Messenger (Meta o Zernio)
 * - Instagram (Meta o Zernio)
 * - TikTok (Zernio)
 * - Canales con conversaciones reales existentes en la base de datos
 */
export async function getLinkedChannelsForOrg(
  organizationId: string
): Promise<Channel[]> {
  const db = getDb();
  const linked = new Set<Channel>();

  // WhatsApp siempre es canal base en Vocero CRM
  linked.add("whatsapp");

  try {
    const [wa, ig, fb, tt, tc, convChannels, orgRow] = await Promise.all([
      db
        .select({ id: schema.metaCredentials.id })
        .from(schema.metaCredentials)
        .where(eq(schema.metaCredentials.organizationId, organizationId))
        .limit(1)
        .catch(() => []),
      db
        .select({ id: schema.instagramCredentials.id })
        .from(schema.instagramCredentials)
        .where(eq(schema.instagramCredentials.organizationId, organizationId))
        .limit(1)
        .catch(() => []),
      db
        .select({ id: schema.messengerCredentials.id })
        .from(schema.messengerCredentials)
        .where(eq(schema.messengerCredentials.organizationId, organizationId))
        .limit(1)
        .catch(() => []),
      db
        .select({ id: schema.tiktokCredentials.id })
        .from(schema.tiktokCredentials)
        .where(eq(schema.tiktokCredentials.organizationId, organizationId))
        .limit(1)
        .catch(() => []),
      db
        .select({ platform: schema.tenantChannels.platform })
        .from(schema.tenantChannels)
        .where(scoped(schema.tenantChannels.organizationId, organizationId))
        .catch(() => []),
      db
        .selectDistinct({ channel: schema.conversation.channel })
        .from(schema.conversation)
        .where(scoped(schema.conversation.organizationId, organizationId))
        .catch(() => []),
      db
        .select({ metadata: schema.organization.metadata })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1)
        .catch(() => []),
    ]);

    if (wa.length > 0) linked.add("whatsapp");
    if (ig.length > 0) linked.add("instagram");
    if (fb.length > 0) linked.add("messenger");
    if (tt.length > 0) linked.add("tiktok");

    for (const t of tc) {
      if (t.platform === "whatsapp" || t.platform === "evolution") {
        linked.add("whatsapp");
      }
    }

    for (const c of convChannels) {
      const ch = c.channel?.toLowerCase();
      if (ch === "whatsapp") linked.add("whatsapp");
      if (ch === "messenger") linked.add("messenger");
      if (ch === "instagram") linked.add("instagram");
      if (ch === "tiktok") linked.add("tiktok");
    }

    // Revisar si en organization.metadata hay canales vinculados declarados
    if (orgRow[0]?.metadata) {
      try {
        const parsed = JSON.parse(orgRow[0].metadata) as {
          linkedChannels?: string[];
          channels?: string[];
        };
        const metaChannels = parsed.linkedChannels || parsed.channels || [];
        for (const m of metaChannels) {
          const ml = String(m).toLowerCase();
          if (["whatsapp", "messenger", "instagram", "tiktok"].includes(ml)) {
            linked.add(ml as Channel);
          }
        }
      } catch {
        // Ignorar metadata no JSON
      }
    }

    // Canales habilitados globalmente por bandera CHANNELS
    const encendidos = enabledChannels();
    for (const ch of encendidos) {
      if (ch === "messenger" && fb.length > 0) linked.add("messenger");
      if (ch === "instagram" && ig.length > 0) linked.add("instagram");
    }
  } catch {
    linked.add("whatsapp");
  }

  return Array.from(linked);
}

