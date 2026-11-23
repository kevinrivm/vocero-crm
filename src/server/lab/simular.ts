import { and, asc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { leerConfigDespacho } from "@/server/brains/config";
import { olvidar, turnoPorDespacho } from "./runner";

/**
 * 069 — Probar el agente sin WhatsApp (`POST /api/v1/agent/simulate` y la
 * herramienta `simulate_conversation` del MCP).
 *
 * En Vocero Cloud esto es un «ensayo» que Nea corre aparte. En la raíz el
 * cerebro puede ser cualquiera (Nea u otro), así que se usa el mismo camino
 * que ya prueba el Laboratorio: cada línea entra como un mensaje del cliente
 * en una conversación `is_test`, se le despacha al cerebro que de verdad
 * contesta, y su respuesta vuelve por `/api/bot/messages`, que la guarda sin
 * enviarla (el sender lanza `sandbox_violation` para `is_test`: no se toca).
 * Una cita de prueba tampoco llega a ningún conector.
 *
 * Al terminar, el cerebro olvida la conversación y el contacto sintético se
 * borra con todo lo que colgó de él (conversación, mensajes, despachos,
 * citas de prueba): la simulación no deja rastro en la Bandeja ni en
 * Resultados.
 */

export const MAX_TURNOS = 10;
export const MAX_HISTORIAL = 40;
export const MAX_TEXTO = 2000;

export type LineaHistorial = { role: "customer" | "agent"; text: string };

export type Accion =
  | { type: "handoff"; reason: string | null }
  | { type: "stage"; from: string | null; to: string }
  | { type: "booking"; scheduledAt: string; durationMinutes: number; status: string };

export type TurnoSimulado = {
  customer: string;
  replies: string[];
  actions: Accion[];
  /** Por qué el cerebro no contestó, si no contestó (no recibió el despacho a tiempo, lo rechazó). */
  error: string | null;
  /** Tras un traspaso a una persona el agente ya no contesta: como en el CRM de verdad. */
  skipped?: "handoff";
};

export type ResultadoSimulacion =
  | { ok: true; turns: TurnoSimulado[] }
  | { ok: false; code: "sin_cerebro"; detalle: string };

/** Un teléfono sintético que no es de nadie: el prefijo 52 000 no se asigna en México. */
function telefonoDePrueba(): string {
  return `52000${Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, "0")}`;
}

export async function simular(input: {
  organizationId: string;
  turns: string[];
  history: LineaHistorial[];
  contactName?: string;
}): Promise<ResultadoSimulacion> {
  if (!leerConfigDespacho().active) {
    return {
      ok: false,
      code: "sin_cerebro",
      detalle:
        "No hay un agente conectado: la simulación prueba al cerebro que contesta a tus clientes (Nea u otro).",
    };
  }

  const db = getDb();
  const { organizationId } = input;
  const phone = telefonoDePrueba();
  const contactId = newId("contact");
  await db.insert(schema.contact).values({
    id: contactId,
    organizationId,
    phone,
    waIdentity: phone,
    name: input.contactName?.trim() || "Cliente de prueba",
    // Archivado: no aparece en la lista de contactos ni genera leads.
    archivedAt: new Date(),
  });
  const convId = newId("conversation");
  await db.insert(schema.conversation).values({
    id: convId,
    organizationId,
    contactId,
    isTest: true,
    aiEnabled: true,
  });

  try {
    // El historial va antes, con horas del pasado: el cerebro lo lee como la
    // conversación que ya hubo.
    const inicio = Date.now() - (input.history.length + 1) * 60_000;
    for (const [i, linea] of input.history.entries()) {
      const at = new Date(inicio + i * 60_000);
      const delCliente = linea.role === "customer";
      await db.insert(schema.message).values({
        id: newId("message"),
        organizationId,
        conversationId: convId,
        direction: delCliente ? "in" : "out",
        type: "text",
        text: linea.text,
        status: delCliente ? "delivered" : "sent",
        ...(delCliente ? {} : { aiGenerated: true, origin: "ai" as const }),
        waTimestamp: at,
        createdAt: at,
      });
    }

    const turnos: TurnoSimulado[] = [];
    for (const linea of input.turns) {
      const [conv] = await db
        .select({ handoffAt: schema.conversation.handoffAt })
        .from(schema.conversation)
        .where(eq(schema.conversation.id, convId))
        .limit(1);
      if (conv?.handoffAt) {
        turnos.push({ customer: linea, replies: [], actions: [], error: null, skipped: "handoff" });
        continue;
      }

      const desde = new Date();
      const messageId = newId("message");
      await db.insert(schema.message).values({
        id: messageId,
        organizationId,
        conversationId: convId,
        direction: "in",
        type: "text",
        text: linea,
        status: "delivered",
        waTimestamp: desde,
      });
      await db
        .update(schema.conversation)
        .set({ lastInboundAt: desde, lastMessageAt: desde, updatedAt: desde })
        .where(eq(schema.conversation.id, convId));

      const error = await turnoPorDespacho(organizationId, convId, messageId, desde);
      turnos.push({ customer: linea, ...(await loQuePaso(organizationId, convId, contactId, desde)), error });
      if (error) break;
    }
    return { ok: true, turns: turnos };
  } finally {
    await olvidar(organizationId, convId, contactId);
    await db
      .delete(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
      .catch((err) => console.error("[simular] no se pudo borrar el contacto de prueba:", err));
  }
}

/** Lo que el agente hizo desde `desde`: sus mensajes, el traspaso, la etapa y la cita. */
async function loQuePaso(
  organizationId: string,
  conversationId: string,
  contactId: string,
  desde: Date
): Promise<{ replies: string[]; actions: Accion[] }> {
  const db = getDb();
  const salientes = await db
    .select({ text: schema.message.text, type: schema.message.type })
    .from(schema.message)
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        eq(schema.message.conversationId, conversationId),
        eq(schema.message.direction, "out"),
        gt(schema.message.createdAt, desde)
      )
    )
    .orderBy(asc(schema.message.createdAt));
  const replies = salientes.map((m) => m.text ?? `[${m.type}]`);

  const actions: Accion[] = [];
  const [conv] = await db
    .select({ handoffAt: schema.conversation.handoffAt, handoffReason: schema.conversation.handoffReason })
    .from(schema.conversation)
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);
  if (conv?.handoffAt && conv.handoffAt > desde) {
    actions.push({ type: "handoff", reason: conv.handoffReason });
  }

  const etapas = await db
    .select({ from: schema.leadStageEvent.fromStageName, to: schema.leadStageEvent.toStageName })
    .from(schema.leadStageEvent)
    .where(
      and(
        eq(schema.leadStageEvent.organizationId, organizationId),
        eq(schema.leadStageEvent.contactId, contactId),
        gt(schema.leadStageEvent.occurredAt, desde)
      )
    );
  for (const e of etapas) actions.push({ type: "stage", from: e.from, to: e.to });

  const citas = await db
    .select({
      scheduledAt: schema.booking.scheduledAt,
      durationMinutes: schema.booking.durationMinutes,
      status: schema.booking.status,
    })
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.organizationId, organizationId),
        eq(schema.booking.contactId, contactId),
        gt(schema.booking.createdAt, desde)
      )
    );
  for (const c of citas) {
    actions.push({
      type: "booking",
      scheduledAt: c.scheduledAt.toISOString(),
      durationMinutes: c.durationMinutes,
      status: c.status,
    });
  }
  return { replies, actions };
}
