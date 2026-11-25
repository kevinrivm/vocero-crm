import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import { anotarSalidaDelEquipo } from "@/server/inbox/reactivacion";

/**
 * 068 — Una persona del negocio contestó: la IA se hace a un lado.
 *
 * Da igual por dónde contestó: desde la app del teléfono (llega como eco de
 * coexistencia) o desde la Bandeja del CRM. Antes solo el eco pausaba, así que
 * si el dueño escribía desde la Bandeja y el cliente volvía a escribir, el
 * cerebro contestaba encima de una conversación que ya llevaba una persona.
 *
 * Idempotente y atómica: solo actúa si no hay handoff. Si el agente ya había
 * escalado, o la conversación ya estaba en pausa, se respeta su motivo.
 *
 * Devuelve true si esta llamada fue la que pausó.
 */
export async function pausarIaPorRespuestaManual(
  organizationId: string,
  conversationId: string,
  /** 076 — Cuándo escribió la persona (el eco trae la hora de Meta). */
  at: Date = new Date()
): Promise<boolean> {
  // 076: la hora de la persona se anota SIEMPRE, también si la IA ya estaba
  // en pausa: es lo que decide cuándo puede volver (`reactivacion.ts`).
  await anotarSalidaDelEquipo(organizationId, conversationId, at);
  const ahora = new Date();
  const paused = await getDb()
    .update(schema.conversation)
    .set({
      aiEnabled: false,
      handoffAt: ahora,
      handoffReason: "manual_reply",
      updatedAt: ahora,
    })
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId),
        isNull(schema.conversation.handoffAt),
        // 076: una pausa indefinida del panel ya es «la lleva una persona», y
        // abrir un traspaso encima haría que la IA volviera a las N horas.
        or(eq(schema.conversation.aiEnabled, true), isNotNull(schema.conversation.aiPausedUntil))
      )
    )
    .returning({ id: schema.conversation.id });
  if (!paused[0]) return false;
  console.log(
    `[inbox] respuesta de una persona en ${conversationId}: IA en pausa (manual_reply)`
  );
  return true;
}

/**
 * Lo mismo, tras un envío desde la Bandeja que sí salió. Además avisa a las
 * pantallas abiertas para que el panel muestre la pausa sin recargar.
 *
 * Nunca tumba el envío: el mensaje ya se mandó, y un fallo al pausar solo
 * queda en el log.
 */
export async function pausarIaTrasEnvioDeLaBandeja(
  organizationId: string,
  conversationId: string
): Promise<void> {
  try {
    if (await pausarIaPorRespuestaManual(organizationId, conversationId)) {
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: conversationId } },
      });
    }
  } catch (err) {
    console.error(
      `[inbox] no se pudo pausar la IA en ${conversationId} tras el envío`,
      err instanceof Error ? err.message : err
    );
  }
}
