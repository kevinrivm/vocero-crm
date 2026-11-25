import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { encolarDespacho, ventanaCoalesceMs, ventanaLargaMs } from "@/server/dispatch/outbox";
import { ventanaParaMensaje } from "@/server/dispatch/ventana";
import { mostrarEscribiendo } from "@/server/whatsapp/escribiendo";
import { iniciarWorker, programarTanda } from "@/server/dispatch/worker";

/**
 * 021 — El enganche de la ingesta: un mensaje entrante real ya está en la
 * bandeja y hay un cerebro configurado, así que su turno se ENCOLA.
 *
 * 036 — Desde que el CRM no trae agente, este es el único camino por el que
 * alguien contesta, y el interruptor de la pantalla Agente
 * (`agent_profile.enabled`) decide si se toma: apagado, la conversación
 * queda en la bandeja para una persona.
 *
 * Nunca lanza. Corre al final de la ingesta, dentro del `after()` del webhook:
 * una excepción aquí no puede costarle a ese payload los mensajes que vengan
 * detrás. Lo que no se encoló sigue en la bandeja.
 */
export async function despacharAlCerebro(
  conversationId: string,
  organizationId: string,
  messageId: string
): Promise<void> {
  try {
    const [conv] = await getDb()
      .select({
        aiEnabled: schema.conversation.aiEnabled,
        handoffAt: schema.conversation.handoffAt,
        isTest: schema.conversation.isTest,
        channel: schema.conversation.channel,
      })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.id, conversationId),
          eq(schema.conversation.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!conv) return;

    // Pausada por una persona o traspasada por el agente: no se despacha. Es
    // la misma bandera que respeta `/api/bot/messages`, y aquí la respeta
    // cualquier cerebro sin tener que acordarse. El Laboratorio no pasa por la
    // ingesta, pero una conversación de prueba no sale del CRM por ningún
    // camino.
    if (!conv.aiEnabled || conv.handoffAt || conv.isTest) return;

    const [perfil] = await getDb()
      .select({ enabled: schema.agentProfile.enabled })
      .from(schema.agentProfile)
      .where(eq(schema.agentProfile.organizationId, organizationId))
      .limit(1);
    if (!perfil?.enabled) return;

    // 025 — El despacho anota qué entrante lo provoca: es lo que le debe al
    // cerebro, aunque después la conversación tenga una respuesta.
    // 078 — La espera la decide este mensaje: si deja la ráfaga abierta
    // («Hola», «Ok», el texto del anuncio, una foto) se espera más.
    const [msg] = await getDb()
      .select({ type: schema.message.type, text: schema.message.text })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.organizationId, organizationId),
          eq(schema.message.id, messageId)
        )
      )
      .limit(1);
    const { notBefore } = await encolarDespacho({
      organizationId,
      conversationId,
      messageIds: [messageId],
      ventanaMs: ventanaParaMensaje(msg ?? null, ventanaCoalesceMs(), ventanaLargaMs()),
    });
    // Y el cliente ve «escribiendo…» desde ya: la espera no parece silencio.
    // Best-effort y sin esperar: el turno no depende de esto.
    void mostrarEscribiendo(organizationId, { id: conversationId, ...conv });
    iniciarWorker();
    // Que despierte justo cuando la ventana venza, no en su siguiente barrido.
    programarTanda(notBefore);
  } catch (err) {
    console.error("[despacho] no se pudo encolar el turno:", err);
  }
}
