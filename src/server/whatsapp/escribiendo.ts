import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { graphRequest } from "@/lib/meta/client";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";

export type ResultadoEscribiendo =
  | { ok: true }
  | { ok: false; reason: "sandbox" | "canal_sin_soporte" | "no_connection" | "no_inbound" | "meta_error" };

/**
 * «Escribiendo…» + marcar leído el último entrante.
 *
 * Best-effort: nunca lanza. Lo usan el cerebro (`POST /api/bot/typing`,
 * cuando empieza a pensar) y, desde la 078, el CRM al encolar el turno: así el
 * cliente ve «escribiendo…» mientras se espera a que termine su ráfaga, y esos
 * segundos no parecen un bot que no contesta. WhatsApp lo muestra hasta 25 s o
 * hasta que llega la respuesta.
 *
 * Quien llama decide si la IA puede hablar; aquí solo se cuidan el sandbox y
 * el canal.
 */
export async function mostrarEscribiendo(
  organizationId: string,
  conv: Pick<typeof schema.conversation.$inferSelect, "id" | "isTest" | "channel">
): Promise<ResultadoEscribiendo> {
  try {
    // Sandbox del Laboratorio: jamás toca la API real (guardrail del repo).
    if (conv.isTest) return { ok: false, reason: "sandbox" };
    // Instagram, Messenger y TikTok no tienen este indicador por esta vía.
    if (conv.channel !== "whatsapp") return { ok: false, reason: "canal_sin_soporte" };

    const msgs = await getDb()
      .select({ waMessageId: schema.message.waMessageId })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.organizationId, organizationId),
          eq(schema.message.conversationId, conv.id),
          eq(schema.message.direction, "in"),
          isNotNull(schema.message.waMessageId)
        )
      )
      .orderBy(desc(schema.message.createdAt))
      .limit(1);
    const wamid = msgs[0]?.waMessageId;
    if (!wamid) return { ok: false, reason: "no_inbound" };

    const creds = await getCredentialsByOrg(organizationId);
    if (!creds) return { ok: false, reason: "no_connection" };

    await graphRequest(`${creds.phoneNumberId}/messages`, {
      method: "POST",
      token: creds.token,
      body: {
        messaging_product: "whatsapp",
        status: "read",
        message_id: wamid,
        typing_indicator: { type: "text" },
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "meta_error" };
  }
}
