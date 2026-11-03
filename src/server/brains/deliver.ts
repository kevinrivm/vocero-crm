import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  armarEvento,
  clasificarRespuesta,
  firmarCuerpo,
  CABECERA_DISPATCH,
  CABECERA_EVENTO,
  CABECERA_FIRMA,
  CABECERA_ORG,
  type EventoOlvido,
  type EventoDespacho,
  type MensajeParaEvento,
  type ResultadoEntrega,
} from "@/server/brains/contract";
import { leerConfigDespacho, leerConfigDespachoOrg } from "@/server/brains/config";
import type { FilaDespacho } from "@/server/dispatch/outbox";
import { isWindowOpen, windowExpiresAt } from "@/server/inbox/window";
import { windowMsFor } from "@/server/channels/capabilities";

/**
 * 021 — Entrega de un despacho al cerebro: leer la ráfaga, armar el evento y
 * hacer el POST firmado. Puerto de `src/server/brains/deliver.ts` de Vocero
 * Cloud sin tipos de cerebro: aquí hay uno, el de `BRAIN_DISPATCH_URL`.
 */

/** Lo que el CRM espera por el 2xx. Significa «recibido», no «ya contesté». */
export const TIMEOUT_ENTREGA_MS = 20_000;

/** Cuántos mensajes hacia atrás se mira para delimitar la ráfaga. */
const VENTANA_DE_MENSAJES = 20;

/**
 * Las columnas de un mensaje que el evento necesita, con su adjunto. Función y
 * no constante: el esquema no se toca al importar el módulo.
 */
function columnasDelMensaje() {
  return {
    id: schema.message.id,
    direction: schema.message.direction,
    type: schema.message.type,
    text: schema.message.text,
    createdAt: schema.message.createdAt,
    waMediaId: schema.mediaAsset.waMediaId,
    mimeType: schema.mediaAsset.mimeType,
    caption: schema.mediaAsset.caption,
    fileName: schema.mediaAsset.fileName,
    payload: schema.mediaAsset.payload,
    assetId: schema.mediaAsset.id,
  };
}

function paraEvento(m: {
  id: string;
  createdAt: Date;
  type: string;
  text: string | null;
  waMediaId: string | null;
  mimeType: string | null;
  caption: string | null;
  fileName: string | null;
  payload: unknown;
  assetId: string | null;
}): MensajeParaEvento {
  return {
    id: m.id,
    createdAt: m.createdAt,
    type: m.type,
    text: m.text,
    media: m.assetId
      ? {
          waMediaId: m.waMediaId,
          mimeType: m.mimeType,
          caption: m.caption,
          fileName: m.fileName,
          payload: m.payload,
        }
      : null,
  };
}

/**
 * La ráfaga = lo que el cliente dijo y todavía no se le ha respondido.
 *
 * Se delimita por el último mensaje SALIENTE de la conversación, no por las
 * horas del despacho: `first_message_at` se toma después de persistir el
 * mensaje, así que el primero de la ráfaga podía quedar unos milisegundos
 * ANTES y caerse del evento. Delimitar por la conversación es además robusto
 * frente a relojes desalineados.
 *
 * 025 — `debidos` son los ids que el despacho tiene anotados
 * (`dispatch.message_ids`). El corte por el último saliente confunde «sin
 * responder» con «sin entregar»: lo que el cliente escribe mientras el cerebro
 * piensa queda DETRÁS de la respuesta a lo anterior, y ese mensaje se quedaba
 * sin despacho. Un debido viaja aunque tenga una respuesta del agente después.
 *
 * Lo que sí lo salda es que conteste una PERSONA (cualquier saliente que no
 * sea del agente): ese mensaje ya tuvo quien lo atendiera, y mandárselo al
 * cerebro sería contestarle dos veces al cliente.
 */
export async function rafagaDe(
  organizationId: string,
  conversationId: string,
  debidos: readonly string[] = []
): Promise<MensajeParaEvento[]> {
  const db = getDb();
  const filas = await db
    .select(columnasDelMensaje())
    .from(schema.message)
    .leftJoin(
      schema.mediaAsset,
      eq(schema.mediaAsset.id, schema.message.mediaAssetId)
    )
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        eq(schema.message.conversationId, conversationId)
      )
    )
    .orderBy(desc(schema.message.createdAt))
    .limit(VENTANA_DE_MENSAJES);

  const ordenados = filas.slice().reverse();
  const ultimaSalida = ordenados.reduce(
    (idx, m, i) => (m.direction === "out" ? i : idx),
    -1
  );
  const rafaga = ordenados
    .slice(ultimaSalida + 1)
    .filter((m) => m.direction === "in");

  const enRafaga = new Set(rafaga.map((m) => m.id));
  const faltan = [...new Set(debidos)].filter((id) => !enRafaga.has(id));
  if (!faltan.length) return rafaga.map(paraEvento);

  // La comparación de horas se hace en Postgres, que guarda microsegundos: en
  // JS dos mensajes del mismo milisegundo no tienen orden.
  const atrasados = await db
    .select(columnasDelMensaje())
    .from(schema.message)
    .leftJoin(
      schema.mediaAsset,
      eq(schema.mediaAsset.id, schema.message.mediaAssetId)
    )
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        and(
          eq(schema.message.conversationId, conversationId),
          eq(schema.message.direction, "in"),
          inArray(schema.message.id, faltan),
          sql`${schema.message.createdAt} > coalesce((
            select max(s.created_at) from message s
            where s.organization_id = ${organizationId}
              and s.conversation_id = ${conversationId}
              and s.direction = 'out'
              and s.ai_generated = false
          ), '-infinity'::timestamp)`
        )
      )
    )
    .orderBy(schema.message.createdAt);
  // Los atrasados son, por definición, anteriores al último saliente; la
  // ráfaga, posterior. Concatenar ya los deja en orden.
  return [...atrasados, ...rafaga].map(paraEvento);
}

/**
 * Pura: ¿la ráfaga de ahora trae algo que el evento entregado no llevaba?
 *
 * Un mensaje que entra mientras su despacho está en vuelo no viaja en ese
 * evento (el cerebro ya lo tiene), así que al entregar se vuelve a mirar: si
 * hay algo nuevo, se encola otro despacho. Se compara por id y no por hora por
 * lo mismo que el lease: microsegundos contra milisegundos.
 */
export function hayMensajesSinDespachar(
  entregados: readonly string[],
  rafagaActual: readonly { id: string }[]
): boolean {
  return sinDespachar(entregados, rafagaActual).length > 0;
}

/** Pura: cuáles. Son los ids que el despacho siguiente lleva anotados. */
export function sinDespachar(
  entregados: readonly string[],
  rafagaActual: readonly { id: string }[]
): string[] {
  const vistos = new Set(entregados);
  return rafagaActual.filter((m) => !vistos.has(m.id)).map((m) => m.id);
}

/**
 * Arma el evento normalizado desde la base. `null` si la conversación o el
 * contacto ya no existen.
 *
 * 025 — Puede salir con `messages` vacío: una persona contestó a mano dentro
 * de la ventana y ya no se debe nada. Ese evento no se entrega; quien llama lo
 * descarta.
 */
export async function construirEvento(
  fila: FilaDespacho
): Promise<EventoDespacho | null> {
  const db = getDb();
  const [conv] = await db
    .select()
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        fila.organizationId,
        eq(schema.conversation.id, fila.conversationId)
      )
    )
    .limit(1);
  if (!conv) return null;

  const [org] = await db
    .select({ id: schema.organization.id, slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.id, fila.organizationId))
    .limit(1);
  if (!org) return null;

  const [contact] = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        fila.organizationId,
        eq(schema.contact.id, conv.contactId)
      )
    )
    .limit(1);
  if (!contact) return null;

  const messages = await rafagaDe(
    fila.organizationId,
    conv.id,
    fila.messageIds ?? []
  );

  return armarEvento({
    dispatchId: fila.id,
    organization: org,
    conversation: {
      id: conv.id,
      channel: conv.channel,
      aiEnabled: conv.aiEnabled,
      // 022: la ventana es la del canal (48 h en TikTok).
      windowOpen: isWindowOpen(
        conv.lastInboundAt,
        new Date(),
        windowMsFor(conv.channel)
      ),
      windowExpiresAt: windowExpiresAt(
        conv.lastInboundAt,
        windowMsFor(conv.channel)
      ),
      test: conv.isTest,
    },
    contact: {
      id: contact.id,
      displayName: contact.name,
      identity: contact.waIdentity,
    },
    messages,
    firstMessageAt: fila.firstMessageAt,
    lastMessageAt: fila.lastMessageAt,
  });
}

/**
 * El POST firmado.
 *
 * Se serializa UNA vez y se firma ese string: firmar un objeto re-serializado
 * produciría una firma que el otro lado no puede reproducir. No se siguen
 * redirecciones —un cerebro no redirige, y seguirlas sería mandarle el turno a
 * donde diga otro—, y ni el cuerpo ni la llave llegan a un log.
 */
export async function entregar(
  evento: EventoDespacho,
  destino: { url: string; secret: string },
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<ResultadoEntrega> {
  const cuerpo = JSON.stringify(evento);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? TIMEOUT_ENTREGA_MS
  );
  try {
    const res = await (opts.fetchImpl ?? fetch)(destino.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [CABECERA_FIRMA]: firmarCuerpo(cuerpo, destino.secret),
        [CABECERA_DISPATCH]: evento.dispatchId,
        [CABECERA_ORG]: evento.organization.slug ?? evento.organization.id,
      },
      redirect: "manual",
      cache: "no-store",
      body: cuerpo,
      signal: controller.signal,
    });
    await res.body?.cancel().catch(() => {});
    return clasificarRespuesta(res.status);
  } catch {
    // Sin respuesta a tiempo, nombre que no resuelve, conexión rechazada:
    // todo reintentable. El cerebro puede estar reiniciándose.
    return {
      ok: false,
      reintentable: true,
      detalle: controller.signal.aborted
        ? `el cerebro no contestó en ${Math.round((opts.timeoutMs ?? TIMEOUT_ENTREGA_MS) / 1000)} s`
        : "no se pudo conectar con el cerebro",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 026 — Lo que ve quien eliminó: si el cerebro confirmó que olvidó. */
export type ResultadoOlvido = "no_aplica" | "avisado" | "sin_confirmar";

/**
 * No se le hace esperar a quien elimina lo que espera un despacho: quien acusa
 * recibo de un borrado solo tiene que guardarlo, no pensar una respuesta.
 */
export const TIMEOUT_OLVIDO_MS = 8000;

/**
 * 026 — Le avisa al cerebro que una conversación se eliminó.
 *
 * Un solo intento, sin cola. El borrado en el CRM ya ocurrió y no depende de
 * esto, y el contrato le pide al cerebro tratar un `conversation.id` nuevo
 * para la misma persona como una conversación nueva — así un aviso perdido no
 * deja memoria en uso, solo guardada hasta que esa persona vuelva a escribir.
 *
 * Sin despacho configurado no hay a quién avisar: el agente incluido no guarda
 * nada aparte, su memoria ERAN los mensajes. Nunca lanza.
 */
export async function avisarOlvido(
  evento: EventoOlvido,
  opts: {
    destino?: { url: string; secret: string } | null;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<ResultadoOlvido> {
  const config = await leerConfigDespachoOrg(evento.organization.id);
  const destino =
    opts.destino !== undefined
      ? opts.destino
      : config.active
        ? { url: config.url, secret: config.secret }
        : null;
  if (!destino) return "no_aplica";

  // Se serializa UNA vez y se firma ese string, igual que un despacho.
  const cuerpo = JSON.stringify(evento);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_OLVIDO_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(destino.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [CABECERA_FIRMA]: firmarCuerpo(cuerpo, destino.secret),
        [CABECERA_EVENTO]: evento.type,
        [CABECERA_ORG]: evento.organization.slug ?? evento.organization.id,
      },
      redirect: "manual",
      cache: "no-store",
      body: cuerpo,
      signal: controller.signal,
    });
    await res.body?.cancel().catch(() => {});
    return res.status >= 200 && res.status < 300 ? "avisado" : "sin_confirmar";
  } catch {
    return "sin_confirmar";
  } finally {
    clearTimeout(timer);
  }
}
