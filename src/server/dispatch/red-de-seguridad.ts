import { and, desc, eq, gt, isNull, lte, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { leerConfigDespacho } from "@/server/brains/config";
import { rafagaDe } from "@/server/brains/deliver";
import { windowMsFor } from "@/server/channels/capabilities";
import { todoEsCierre } from "@/server/dispatch/cierres";
import { encolarDespacho, type FilaDespacho } from "@/server/dispatch/outbox";
import { programarTanda } from "@/server/dispatch/worker";
import { publish } from "@/server/events/bus";

/**
 * 075 — La red de seguridad del despacho: que nadie se quede sin respuesta.
 *
 * El cerebro acusa recibo de un turno (`entregado`) y contesta después, por su
 * cuenta. Si esa respuesta no llega nunca —el turno se colgó, el cerebro se
 * reinició a la mitad, calló por error—, el cliente se queda esperando y nadie
 * se entera: la entrega salió bien, así que la conversación no cayó a una
 * persona. Esta red lo busca cada minuto, vuelve a mandar el turno hasta dos
 * veces y, si sigue sin respuesta, pasa la conversación a una persona con el
 * motivo `sin_respuesta`, que la Bandeja y el hilo muestran.
 *
 * No contesta nada ella misma: el CRM no trae agente. Solo vuelve a despachar
 * al cerebro, por el mismo outbox y el mismo worker, que repiten al entregar
 * todas sus comprobaciones (IA en pausa, conversación borrada…).
 *
 * In-process, como el worker (sin colas externas). Idempotente por despacho:
 * cada uno se reclama una sola vez escribiendo `safety_net_at` con un UPDATE
 * condicionado a que siga vacío, así que dos barridos solapados o dos
 * procesos nunca relanzan el mismo.
 */

/**
 * Lo que se espera desde la entrega antes de actuar. Nea descarta un despacho
 * que no empezó a los 5 minutos y corta su turno a los 4: pasados 10, ningún
 * cerebro que cumpla el contrato sigue con él, y relanzar antes sería pisarle
 * un turno que todavía está pensando.
 */
export const ESPERA_SIN_RESPUESTA_MS = 10 * 60_000;
/** Margen antes de que cierre la ventana del canal: una respuesta tan tardía ya no saldría. */
export const MARGEN_DE_VENTANA_MS = 60 * 60_000;
/** Cuántas veces se vuelve a mandar el mismo turno antes de pasarlo a una persona. */
export const MAX_RELANZAMIENTOS = 2;
/** Lo más viejo que se revisa: más allá, ninguna ventana sigue abierta. */
const ANTIGUEDAD_MAXIMA_MS = 48 * 3_600_000;
const POR_BARRIDO = 50;

type Estado = { timer: NodeJS.Timeout | null; corriendo: boolean };
// En globalThis, como el worker: en dev los módulos se evalúan más de una vez.
const globalForRed = globalThis as unknown as { __voceroRedDeSeguridad?: Estado };

function estado(): Estado {
  globalForRed.__voceroRedDeSeguridad ??= { timer: null, corriendo: false };
  return globalForRed.__voceroRedDeSeguridad;
}

/**
 * Arranca el barrido periódico (idempotente). `RED_DE_SEGURIDAD_MS` es el
 * intervalo; `0` la apaga, y así la corren los guiones locales, que la
 * conducen a mano por `/api/dev/red-de-seguridad` para no relanzar lo que otro
 * guion dejó sin contestar a propósito.
 */
export function iniciarRedDeSeguridad(): void {
  const e = estado();
  if (e.timer) return;
  const intervalo = getEnv().RED_DE_SEGURIDAD_MS;
  if (intervalo <= 0) return;
  e.timer = setInterval(() => void barrido(), intervalo);
  e.timer.unref?.();
}

export function detenerRedDeSeguridad(): void {
  const e = estado();
  if (e.timer) clearInterval(e.timer);
  e.timer = null;
}

export type Decision =
  | { accion: "relanzar"; vuelta: number }
  | { accion: "traspasar" }
  | { accion: "nada"; motivo: string };

export type EntradaDecision = {
  relaunchCount: number;
  /** El cliente volvió a escribir: hay un despacho posterior. */
  hayPosterior: boolean;
  /** Salió algo (del agente o de una persona) después de la entrega. */
  hayRespuesta: boolean;
  despachoActivo: boolean;
  agenteEncendido: boolean;
  conversacion: {
    isTest: boolean;
    aiEnabled: boolean;
    handoffAt: Date | null;
    lastInboundAt: Date | null;
    /** La ventana del canal (24 h en WhatsApp); `Infinity` si no tiene. */
    ventanaMs: number;
  } | null;
  pendientes: readonly { type: string; text: string | null }[];
  ultimaSalida: string | null;
  ahora: Date;
};

/**
 * Pura: qué hacer con un despacho entregado que nadie contestó. Todo llega ya
 * leído, para poder probar cada salida sin base.
 */
export function decidir(e: EntradaDecision): Decision {
  const nada = (motivo: string): Decision => ({ accion: "nada", motivo });
  if (e.hayPosterior) return nada("el cliente volvió a escribir: lo contesta el despacho siguiente");
  if (e.hayRespuesta) return nada("ya salió una respuesta después de la entrega");
  const conv = e.conversacion;
  if (!conv) return nada("la conversación ya no existe");
  // El sandbox del Laboratorio no pasa por aquí: nada de prueba se relanza.
  if (conv.isTest) return nada("conversación de prueba");
  if (!e.despachoActivo) return nada("el despacho al cerebro ya no está configurado");
  if (!e.agenteEncendido) return nada("el agente está apagado");
  if (!conv.aiEnabled || conv.handoffAt) return nada("la IA está en pausa o la atiende una persona");
  if (
    !conv.lastInboundAt ||
    e.ahora.getTime() - conv.lastInboundAt.getTime() > conv.ventanaMs - MARGEN_DE_VENTANA_MS
  ) {
    return nada("fuera de la ventana del canal");
  }
  if (e.pendientes.length === 0) return nada("no queda nada sin contestar");
  if (todoEsCierre(e.pendientes, e.ultimaSalida)) {
    return nada("solo hay cierres («gracias», «ok»): callar estuvo bien");
  }
  if (e.relaunchCount >= MAX_RELANZAMIENTOS) return { accion: "traspasar" };
  return { accion: "relanzar", vuelta: e.relaunchCount + 1 };
}

/** Entregados sin revisar que ya esperaron lo suficiente (va por `dispatch_red_seguridad_idx`). */
async function candidatos(
  ahora: Date,
  esperaMs: number,
  soloConversacion?: string
): Promise<FilaDespacho[]> {
  const d = schema.dispatch;
  return getDb()
    .select()
    .from(d)
    .where(
      and(
        eq(d.status, "entregado"),
        isNull(d.safetyNetAt),
        lte(d.updatedAt, new Date(ahora.getTime() - esperaMs)),
        gt(d.updatedAt, new Date(ahora.getTime() - ANTIGUEDAD_MAXIMA_MS)),
        soloConversacion ? eq(d.conversationId, soloConversacion) : undefined
      )
    )
    .orderBy(d.updatedAt)
    .limit(POR_BARRIDO);
}

/** La sección crítica: solo un barrido gana cada despacho. */
async function reclamar(fila: FilaDespacho, ahora: Date): Promise<boolean> {
  const rows = await getDb()
    .update(schema.dispatch)
    .set({ safetyNetAt: ahora })
    .where(
      scoped(
        schema.dispatch.organizationId,
        fila.organizationId,
        eq(schema.dispatch.id, fila.id),
        isNull(schema.dispatch.safetyNetAt)
      )
    )
    .returning({ id: schema.dispatch.id });
  return rows.length === 1;
}

/** Lee de la base todo lo que `decidir` necesita. Cada lectura, con su organización. */
async function leer(fila: FilaDespacho, ahora: Date) {
  const db = getDb();
  const org = fila.organizationId;
  // Las horas de este despacho se comparan dentro de Postgres, que guarda
  // microsegundos; el `Date` de JS no.
  const creado = sql`(select d.created_at from dispatch d where d.id = ${fila.id} and d.organization_id = ${org})`;
  const entregado = sql`(select d.updated_at from dispatch d where d.id = ${fila.id} and d.organization_id = ${org})`;

  const [posterior] = await db
    .select({ id: schema.dispatch.id })
    .from(schema.dispatch)
    .where(
      scoped(
        schema.dispatch.organizationId,
        org,
        eq(schema.dispatch.conversationId, fila.conversationId),
        ne(schema.dispatch.id, fila.id),
        sql`${schema.dispatch.createdAt} > ${creado}`
      )
    )
    .limit(1);

  /**
   * Respondido = salió algo DESPUÉS de la entrega. No desde que se creó el
   * despacho: en la ventana de agrupado puede salir la respuesta al turno
   * anterior, y esa no contesta a este.
   */
  const [salida] = await db
    .select({ id: schema.message.id })
    .from(schema.message)
    .where(
      scoped(
        schema.message.organizationId,
        org,
        eq(schema.message.conversationId, fila.conversationId),
        eq(schema.message.direction, "out"),
        sql`${schema.message.createdAt} > ${entregado}`
      )
    )
    .limit(1);

  const [conv] = await db
    .select()
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, org, eq(schema.conversation.id, fila.conversationId)))
    .limit(1);

  const [perfil] = await db
    .select({ enabled: schema.agentProfile.enabled })
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, org))
    .limit(1);

  const [ultima] = await db
    .select({ text: schema.message.text })
    .from(schema.message)
    .where(
      scoped(
        schema.message.organizationId,
        org,
        eq(schema.message.conversationId, fila.conversationId),
        eq(schema.message.direction, "out")
      )
    )
    .orderBy(desc(schema.message.createdAt))
    .limit(1);

  const pendientes = conv ? await rafagaDe(org, conv.id, fila.messageIds ?? []) : [];
  return {
    pendientes,
    decision: decidir({
      relaunchCount: fila.relaunchCount,
      hayPosterior: Boolean(posterior),
      hayRespuesta: Boolean(salida),
      despachoActivo: leerConfigDespacho().active,
      agenteEncendido: perfil?.enabled === true,
      conversacion: conv
        ? {
            isTest: conv.isTest,
            aiEnabled: conv.aiEnabled,
            handoffAt: conv.handoffAt,
            lastInboundAt: conv.lastInboundAt,
            ventanaMs: windowMsFor(conv.channel),
          }
        : null,
      pendientes,
      ultimaSalida: ultima?.text ?? null,
      ahora,
    }),
  };
}

/**
 * Pasa la conversación a una persona con el motivo `sin_respuesta`. Solo en la
 * transición: no pisa un traspaso anterior ni su motivo. La Bandeja lo ve en
 * vivo y el hilo lo pinta como evento («La IA se pausó: …»).
 */
async function traspasar(organizationId: string, conversationId: string, ahora: Date): Promise<boolean> {
  const rows = await getDb()
    .update(schema.conversation)
    .set({ aiEnabled: false, handoffAt: ahora, handoffReason: "sin_respuesta", updatedAt: ahora })
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId),
        isNull(schema.conversation.handoffAt)
      )
    )
    .returning({ id: schema.conversation.id });
  if (!rows[0]) return false;
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversationId, handoffReason: "sin_respuesta" } },
  });
  return true;
}

export type ResumenRed = { revisados: number; relanzados: number; traspasados: number };

/**
 * Un barrido. Exportado para `/api/dev/red-de-seguridad`, que lo conduce con
 * otra espera y sobre una sola conversación. No se solapa consigo mismo y
 * nunca lanza: un fallo se reintenta en el siguiente.
 */
export async function barrido(
  opciones: { ahora?: Date; esperaMs?: number; soloConversacion?: string } = {}
): Promise<ResumenRed> {
  const e = estado();
  const resumen: ResumenRed = { revisados: 0, relanzados: 0, traspasados: 0 };
  if (e.corriendo) return resumen;
  e.corriendo = true;
  const ahora = opciones.ahora ?? new Date();
  try {
    const filas = await candidatos(
      ahora,
      opciones.esperaMs ?? ESPERA_SIN_RESPUESTA_MS,
      opciones.soloConversacion
    );
    for (const fila of filas) {
      const { decision, pendientes } = await leer(fila, ahora);
      if (!(await reclamar(fila, ahora))) continue;
      resumen.revisados++;
      if (decision.accion === "nada") continue;
      const minutos = Math.round((ahora.getTime() - fila.updatedAt.getTime()) / 60_000);
      // Al log solo ids y cuentas: ni el texto del cliente ni su teléfono.
      if (decision.accion === "traspasar") {
        console.error(
          `[red] ${fila.id} en ${fila.conversationId}: sin respuesta tras ${MAX_RELANZAMIENTOS} relanzamientos (${minutos} min); pasa a una persona`
        );
        if (await traspasar(fila.organizationId, fila.conversationId, ahora)) resumen.traspasados++;
        continue;
      }
      console.warn(
        `[red] ${fila.id} en ${fila.conversationId}: ${pendientes.length} mensaje(s) sin respuesta desde hace ${minutos} min; se relanza (vuelta ${decision.vuelta})`
      );
      const { notBefore } = await encolarDespacho({
        organizationId: fila.organizationId,
        conversationId: fila.conversationId,
        messageIds: pendientes.map((m) => m.id),
        relanzamiento: decision.vuelta,
      });
      programarTanda(notBefore);
      resumen.relanzados++;
    }
  } catch (err) {
    console.error("[red] el barrido falló; se reintenta en el siguiente:", err);
  } finally {
    e.corriendo = false;
  }
  return resumen;
}
