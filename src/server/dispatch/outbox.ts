import { and, eq, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { publish } from "@/server/events/bus";

/**
 * 021 — El outbox del despachador.
 *
 * Hace cumplir «bandeja primero, cerebro después»: el mensaje ya está en
 * `message` antes de que exista una fila aquí. Si el despacho falla, el
 * mensaje sigue en la bandeja; si el proceso muere, el lease expira y el
 * siguiente barrido la retoma.
 *
 * El agrupado de ráfagas NO se implementa con temporizadores: lo hace el
 * índice único parcial `dispatch_conversation_vivo_uq`, que permite como
 * máximo UN despacho vivo por conversación. Encolar cinco mensajes seguidos
 * hace un INSERT y cuatro UPDATE de la ventana. La garantía la da Postgres,
 * así que sobrevive a que alguien reescriba el worker.
 *
 * Puerto de `src/server/dispatch/outbox.ts` de Vocero Cloud.
 */

/**
 * Cuánto se espera desde el último mensaje antes de despachar.
 *
 * Es la MISMA variable que usa el agente incluido (`AGENT_COALESCE_MS`), y a
 * propósito: la pregunta que responde es idéntica —cuánto esperar a que
 * alguien termine de escribir su ráfaga— y los dos caminos nunca están vivos a
 * la vez. Dos nombres para un solo concepto solo servirían para que alguien
 * bajara uno y se preguntara por qué no pasa nada.
 */
export function ventanaCoalesceMs(): number {
  return getEnv().AGENT_COALESCE_MS;
}

/** 078 — La espera cuando el último mensaje deja la ráfaga abierta (`ventana.ts`). */
export function ventanaLargaMs(): number {
  return Math.max(getEnv().AGENT_COALESCE_MS, getEnv().AGENT_COALESCE_LARGO_MS);
}

/** Cuánto tiempo un worker se reserva una fila antes de que otro pueda tomarla. */
export const LEASE_MS = 180_000;
export const MAX_INTENTOS = 3;
/** Espera tras el intento 1 y tras el 2. El tercero ya no reintenta. */
export const BACKOFF_MS = [1000, 4000];

/** Pura: la espera base antes del siguiente intento. */
export function esperaDeReintento(intentosHechos: number): number {
  const i = Math.min(Math.max(intentosHechos, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[i] ?? 1000;
}

export type FilaDespacho = typeof schema.dispatch.$inferSelect;

/**
 * Encola (o extiende) el despacho de una conversación.
 *
 * Idempotente por construcción: si ya hay uno pendiente, empuja su ventana en
 * vez de crear otro. Devuelve CUÁNDO vence esa ventana, para que quien encola
 * despierte al worker en ese instante en vez de esperar a su siguiente
 * barrido.
 *
 * 025 — `messageIds` son los entrantes que provocan esta llamada. Se anotan en
 * la fila viva —también si va EN VUELO— porque son lo que ese despacho le debe
 * al cerebro: la ráfaga sola no alcanza a decirlo (ver `rafagaDe`).
 */
export async function encolarDespacho(params: {
  organizationId: string;
  conversationId: string;
  messageIds?: readonly string[];
  ahora?: Date;
  /**
   * 033 — Sin ventana de agrupado: lo usa el Laboratorio, que manda una línea
   * del guion a la vez y no tiene a nadie más escribiendo detrás.
   */
  inmediato?: boolean;
  /**
   * 075 — Lo encola la red de seguridad: qué vuelta es (1 o 2). Solo cuenta
   * si abre una fila nueva. Si ya hay una viva, la abrió el cliente al volver
   * a escribir, y esa no es un relanzamiento.
   */
  relanzamiento?: number;
  /**
   * 078 — Cuánto esperar desde ESTE mensaje (`ventanaParaMensaje`). Sin ella,
   * la espera normal. Como cada mensaje reabre la ventana, la decide el
   * último de la ráfaga.
   */
  ventanaMs?: number;
}): Promise<{ id: string; notBefore: Date }> {
  const db = getDb();
  const ahora = params.ahora ?? new Date();
  const notBefore = new Date(
    ahora.getTime() + (params.inmediato ? 0 : (params.ventanaMs ?? ventanaCoalesceMs()))
  );
  const messageIds = [...new Set(params.messageIds ?? [])];
  // Se concatena en SQL y no leyendo-y-escribiendo: dos mensajes que llegan a
  // la vez no pueden pisarse la lista el uno al otro.
  const anotados: { messageIds?: SQL } = messageIds.length
    ? {
        messageIds: sql`coalesce(${schema.dispatch.messageIds}, '[]'::jsonb) || ${JSON.stringify(messageIds)}::jsonb`,
      }
    : {};

  // Casi siempre una vuelta. Se repite solo si la fila viva cambió bajo los
  // pies: otro mensaje ganó el índice único, o el worker la tomó justo ahora.
  for (let vuelta = 0; ; vuelta++) {
    const [vivo] = await db
      .select()
      .from(schema.dispatch)
      .where(
        and(
          eq(schema.dispatch.conversationId, params.conversationId),
          inArray(schema.dispatch.status, ["pendiente", "en_vuelo"])
        )
      )
      .limit(1);

    if (vivo) {
      // En vuelo no se toca `not_before`: el cerebro ya tiene el evento, sin
      // este mensaje, y adelantar la ventana no lo haría llegar antes. Queda
      // anotado en la fila, y el worker, al entregarla, ve que lo sigue
      // debiendo y encola otro despacho.
      const enVuelo = vivo.status === "en_vuelo";
      if (enVuelo && !messageIds.length) {
        return { id: vivo.id, notBefore: vivo.notBefore };
      }
      /**
       * Solo si SIGUE vivo.
       *
       * Entre el SELECT de arriba y este UPDATE el worker pudo terminarlo. Lo
       * anotado en una fila ya entregada no lo vuelve a leer nadie: ese
       * mensaje se quedaría sin despacho. Si ya no está vivo, abre su fila.
       */
      const [tocado] = await db
        .update(schema.dispatch)
        .set(
          enVuelo
            ? anotados
            : { notBefore, lastMessageAt: ahora, updatedAt: ahora, ...anotados }
        )
        .where(
          and(
            eq(schema.dispatch.id, vivo.id),
            eq(schema.dispatch.status, vivo.status)
          )
        )
        .returning({ notBefore: schema.dispatch.notBefore });
      if (tocado) return { id: vivo.id, notBefore: tocado.notBefore };
    }

    const id = newId("dispatch");
    try {
      await db.insert(schema.dispatch).values({
        id,
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        status: "pendiente",
        notBefore,
        firstMessageAt: ahora,
        lastMessageAt: ahora,
        messageIds: messageIds.length ? messageIds : null,
        relaunchCount: params.relanzamiento ?? 0,
      });
      return { id, notBefore };
    } catch (err) {
      // Dos mensajes de la misma conversación entraron a la vez y el otro ganó
      // el índice único. Su fila cubre a este mensaje, pero no lo tiene
      // anotado: se vuelve a empezar para anotarlo en ella.
      if (!esViolacionDeUnicidad(err)) throw err;
      if (vuelta >= 2 || !messageIds.length) return { id, notBefore };
    }
  }
}

/**
 * 075 — El despacho que el cerebro dice estar contestando, si es de esa
 * organización. `null` si no existe o es de otra: las dos cosas se ven igual
 * desde fuera.
 */
export async function despachoDe(
  organizationId: string,
  dispatchId: string
): Promise<FilaDespacho | null> {
  const [fila] = await getDb()
    .select()
    .from(schema.dispatch)
    .where(
      scoped(
        schema.dispatch.organizationId,
        organizationId,
        eq(schema.dispatch.id, dispatchId)
      )
    )
    .limit(1);
  return fila ?? null;
}

/**
 * 075 — ¿El cliente volvió a escribir después de este despacho?
 *
 * Un despacho queda `entregado` en cuanto el cerebro acusa recibo, pero el
 * cerebro tarda en pensar. Si el cliente escribe en ese rato, se abre un
 * despacho nuevo, y su ráfaga lleva TODO lo que el cliente dijo desde la
 * última respuesta: también lo de este. Contestar los dos produce dos
 * mensajes seguidos que se pisan; basta con contestar el último.
 *
 * Cuenta el posterior que sigue pendiente, en vuelo o ya entregado: alguien
 * lo va a contestar. No cuentan el descartado ni el caducado a una persona:
 * si este también callara, el cliente se quedaría sin ninguna respuesta. La
 * hora se compara dentro de Postgres (microsegundos) y no en JS.
 */
export async function despachoSuperado(despacho: {
  id: string;
  organizationId: string;
  conversationId: string;
}): Promise<boolean> {
  const posteriores = await getDb()
    .select({ id: schema.dispatch.id })
    .from(schema.dispatch)
    .where(
      scoped(
        schema.dispatch.organizationId,
        despacho.organizationId,
        and(
          eq(schema.dispatch.conversationId, despacho.conversationId),
          ne(schema.dispatch.id, despacho.id),
          inArray(schema.dispatch.status, ["pendiente", "en_vuelo", "entregado"]),
          sql`${schema.dispatch.createdAt} > (select d.created_at from dispatch d where d.id = ${despacho.id} and d.organization_id = ${despacho.organizationId})`
        )
      )
    )
    .limit(1);
  return posteriores.length > 0;
}

/**
 * 025 — Los ids anotados en la fila AHORA, no los que traía cuando se reclamó.
 *
 * Mientras el despacho iba en vuelo pudieron anotarse más: son justo los que
 * el evento no llevó.
 */
export async function mensajesAnotados(fila: FilaDespacho): Promise<string[]> {
  const [row] = await getDb()
    .select({ messageIds: schema.dispatch.messageIds })
    .from(schema.dispatch)
    .where(
      and(
        eq(schema.dispatch.id, fila.id),
        eq(schema.dispatch.organizationId, fila.organizationId)
      )
    )
    .limit(1);
  return [...new Set(row?.messageIds ?? [])];
}

function esViolacionDeUnicidad(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/**
 * Toma hasta `limite` despachos cuya ventana ya venció.
 *
 * El lease es lo que permite que varios procesos (o el mismo tras reiniciar)
 * no se pisen: se marca `en_vuelo` con `leased_until`, y una fila cuyo lease
 * expiró vuelve a estar disponible aunque siga marcada en vuelo.
 */
export async function tomarPendientes(
  limite = 10,
  ahora: Date = new Date()
): Promise<FilaDespacho[]> {
  const db = getDb();
  const candidatos = await db
    .select()
    .from(schema.dispatch)
    .where(
      or(
        and(
          eq(schema.dispatch.status, "pendiente"),
          lte(schema.dispatch.notBefore, ahora)
        ),
        // Lease vencido: el worker que la tomó murió a mitad.
        and(
          eq(schema.dispatch.status, "en_vuelo"),
          lte(schema.dispatch.leasedUntil, ahora)
        )
      )
    )
    .orderBy(schema.dispatch.notBefore)
    .limit(limite);

  const tomados: FilaDespacho[] = [];
  for (const fila of candidatos) {
    /**
     * La reclamación es este UPDATE, no el SELECT de arriba, y se condiciona
     * al estado y al contador de intentos.
     *
     * Comparar el timestamp parecía un candado más fino, pero es frágil de una
     * forma silenciosa: Postgres guarda microsegundos y el `Date` de JS solo
     * milisegundos, así que el valor releído puede no ser idéntico al
     * almacenado y el UPDATE no casa nunca. El contador entero distingue a dos
     * dueños aunque ambos vean la fila en vuelo.
     */
    const res = await db
      .update(schema.dispatch)
      .set({
        status: "en_vuelo",
        leasedUntil: new Date(ahora.getTime() + LEASE_MS),
        attempts: fila.attempts + 1,
        updatedAt: ahora,
      })
      .where(
        and(
          eq(schema.dispatch.id, fila.id),
          eq(schema.dispatch.status, fila.status),
          eq(schema.dispatch.attempts, fila.attempts),
          fila.status === "en_vuelo"
            ? lte(schema.dispatch.leasedUntil, ahora)
            : lte(schema.dispatch.notBefore, ahora)
        )
      )
      .returning();
    if (res[0]) tomados.push(res[0]);
  }
  return tomados;
}

/** La fila sigue siendo de quien la tomó. */
function propietario(fila: FilaDespacho) {
  return and(
    eq(schema.dispatch.id, fila.id),
    eq(schema.dispatch.status, "en_vuelo"),
    eq(schema.dispatch.attempts, fila.attempts)
  );
}

export async function renovarLease(fila: FilaDespacho): Promise<boolean> {
  const rows = await getDb()
    .update(schema.dispatch)
    .set({ leasedUntil: new Date(Date.now() + LEASE_MS) })
    .where(propietario(fila))
    .returning({ id: schema.dispatch.id });
  return rows.length === 1;
}

export async function marcarEntregado(fila: FilaDespacho): Promise<boolean> {
  const rows = await getDb()
    .update(schema.dispatch)
    .set({
      status: "entregado",
      leasedUntil: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(propietario(fila))
    .returning({ id: schema.dispatch.id });
  return rows.length === 1;
}

/**
 * Reprograma un intento más, o caduca si ya no quedan.
 * Devuelve `true` si caducó (quien llama pasa la conversación a un humano).
 */
export async function reintentarOCaducar(
  fila: FilaDespacho,
  detalle: string,
  ahora: Date = new Date()
): Promise<boolean> {
  if (fila.attempts >= MAX_INTENTOS) return caducarAHumano(fila, detalle);

  const base = esperaDeReintento(fila.attempts);
  // Variación: sin ella, N despachos que fallaron a la vez reintentan a la
  // vez y vuelven a tumbar al cerebro que apenas se levantaba.
  const espera = base + Math.floor(Math.random() * base * 0.3);
  await getDb()
    .update(schema.dispatch)
    .set({
      status: "pendiente",
      notBefore: new Date(ahora.getTime() + espera),
      leasedUntil: null,
      lastError: detalle.slice(0, 300),
      updatedAt: ahora,
    })
    .where(propietario(fila));
  return false;
}

/** Caduca sin más intentos. `true` si la fila era nuestra y quedó caducada. */
export async function caducarAHumano(
  fila: FilaDespacho,
  detalle: string
): Promise<boolean> {
  const rows = await getDb()
    .update(schema.dispatch)
    .set({
      status: "caducado_a_humano",
      leasedUntil: null,
      lastError: detalle.slice(0, 300),
      updatedAt: new Date(),
    })
    .where(propietario(fila))
    .returning({ id: schema.dispatch.id });
  return rows.length === 1;
}

/**
 * El turno ya no debe existir: se pausó la IA durante la ventana, alguien
 * contestó a mano, o la conversación ya no está.
 *
 * No es un fallo del cerebro ni necesita aviso. Por eso no pasa por
 * `caducarAHumano`, que cuenta como caída y pausa la conversación.
 */
export async function descartarDespacho(
  fila: FilaDespacho,
  detalle: string
): Promise<void> {
  await getDb()
    .update(schema.dispatch)
    .set({
      status: "descartado",
      leasedUntil: null,
      lastError: detalle.slice(0, 300),
      updatedAt: new Date(),
    })
    .where(propietario(fila));
}

/**
 * El cerebro no pudo recibir el turno: la conversación pasa a un humano.
 *
 * Es el traspaso que ya existe —el mismo que deja `POST /api/bot/handoff` y el
 * mismo motivo (`error`) que usa un cerebro cuando no puede contestar—, y
 * publica el mismo evento, así que la bandeja lo ve en vivo. Solo escribe en
 * la transición: no pisa la hora ni el motivo de un traspaso anterior.
 */
export async function pasarAHumano(
  organizationId: string,
  conversationId: string
): Promise<void> {
  const ahora = new Date();
  const rows = await getDb()
    .update(schema.conversation)
    .set({
      aiEnabled: false,
      handoffAt: ahora,
      handoffReason: "error",
      updatedAt: ahora,
    })
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        eq(schema.conversation.organizationId, organizationId),
        isNull(schema.conversation.handoffAt)
      )
    )
    .returning({ id: schema.conversation.id });
  if (!rows[0]) return;
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversationId, handoffReason: "error" } },
  });
}
