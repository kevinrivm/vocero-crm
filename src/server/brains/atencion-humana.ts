import { and, asc, desc, eq, gt, ne, notInArray, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { AtencionHumana } from "@/server/brains/contract";

/**
 * 076 — «Hubo una persona»: lo que el cerebro necesita saber cuando vuelve.
 *
 * El cerebro solo ve lo que se le despacha. Mientras la IA estuvo en pausa,
 * nada se le despachó: no sabe que una persona del equipo atendió ni qué le
 * dijo al cliente. Al volver, contestaba como si la conversación siguiera
 * donde la dejó, y podía cotizar otro precio o contradecir lo que el equipo
 * acababa de prometer.
 *
 * Viaja en el despacho (`humanAttention`) mientras la IA no haya vuelto a
 * hablar desde la última vez que escribió una persona: así lo lleva el turno
 * de la vuelta (sola, por pausa vencida o a mano) y, si ese turno no llegó a
 * contestar, el siguiente. Una vez que la IA contesta, deja de viajar.
 *
 * Lleva lo que pasó desde la última respuesta de la IA: los mensajes del
 * equipo y del cliente, cortos y sin adjuntos, sin los de la ráfaga (esos ya
 * viajan en `messages`). Sin persona del equipo no hay campo, y un despacho
 * sin el campo es idéntico al de antes.
 */

/** Cuántos mensajes de la atención humana viajan, los más recientes. */
export const MAX_MENSAJES_ATENCION = 20;
/** Largo máximo de cada uno: es contexto, no el hilo completo. */
export const MAX_TEXTO_ATENCION = 500;

/** Pura: recorta el texto de un mensaje para la nota. */
export function recortarParaNota(texto: string | null): string | null {
  if (texto === null) return null;
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  return limpio.length > MAX_TEXTO_ATENCION ? `${limpio.slice(0, MAX_TEXTO_ATENCION - 1)}…` : limpio;
}

export async function atencionHumanaPara(
  organizationId: string,
  conv: { id: string; lastTeamOutAt: Date | null },
  enLaRafaga: readonly string[]
): Promise<AtencionHumana | null> {
  if (!conv.lastTeamOutAt) return null;
  const m = schema.message;
  const db = getDb();

  const [ia] = await db
    .select({ at: m.createdAt })
    .from(m)
    .where(scoped(m.organizationId, organizationId, and(eq(m.conversationId, conv.id), eq(m.direction, "out"), eq(m.aiGenerated, true))))
    .orderBy(desc(m.createdAt))
    .limit(1);
  // La IA ya habló después de la persona: el cerebro ya tuvo su turno con la nota.
  if (ia && ia.at.getTime() >= conv.lastTeamOutAt.getTime()) return null;

  const despues: SQL[] = [eq(m.conversationId, conv.id), eq(m.aiGenerated, false)];
  if (ia) despues.push(gt(m.createdAt, ia.at));

  const [primero] = await db
    .select({ at: m.createdAt })
    .from(m)
    .where(scoped(m.organizationId, organizationId, and(...despues, eq(m.direction, "out"), ne(m.status, "failed"))))
    .orderBy(asc(m.createdAt))
    .limit(1);

  const filas = await db
    .select({ at: m.createdAt, direction: m.direction, type: m.type, text: m.text })
    .from(m)
    .where(
      scoped(
        m.organizationId,
        organizationId,
        and(
          ...despues,
          sql`not (${m.direction} = 'out' and ${m.status} = 'failed')`,
          ...(enLaRafaga.length ? [notInArray(m.id, [...enLaRafaga])] : [])
        )
      )
    )
    .orderBy(desc(m.createdAt))
    .limit(MAX_MENSAJES_ATENCION);

  return armarAtencion(primero?.at ?? conv.lastTeamOutAt, conv.lastTeamOutAt, filas.reverse());
}

/**
 * Pura: el campo tal como viaja. El orden de las claves es el de la prueba
 * gemela de nea-agent (`tests/test_atencion_humana.py`).
 */
export function armarAtencion(
  since: Date,
  lastTeamMessageAt: Date,
  filas: { at: Date; direction: string; type: string; text: string | null }[]
): AtencionHumana {
  return {
    since: since.toISOString(),
    lastTeamMessageAt: lastTeamMessageAt.toISOString(),
    messages: filas.map((f) => ({
      at: f.at.toISOString(),
      author: f.direction === "out" ? ("team" as const) : ("customer" as const),
      type: f.type,
      text: recortarParaNota(f.text),
    })),
  };
}
