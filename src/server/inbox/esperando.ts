import { sql, type SQL } from "drizzle-orm";
import type { Channel } from "@/lib/channels";
import { schema } from "@/lib/db";
import type { EsperaDto } from "@/lib/esperando";
import { CHANNEL_CAPABILITIES, capabilitiesFor, windowMsFor } from "@/server/channels/capabilities";

/**
 * 077 — Qué es «esperando a una persona», en UN sitio.
 *
 * Una conversación espera a una persona cuando se cumplen las cuatro:
 *
 *  1. **Necesita a una persona**: traspaso abierto (`handoff_at`) o la IA en
 *     pausa o apagada para ese chat (`ai_enabled = false`). Con el agente del
 *     negocio apagado cuentan estas mismas y no toda la Bandeja: quien
 *     contesta puede ser otra cosa (D3).
 *  2. **El último mensaje es del cliente**: nada salió después de él. Con una
 *     excepción a propósito: con un traspaso abierto, lo que la IA escribió
 *     en el turno que escaló («te paso con una persona») es su despedida, no
 *     una respuesta. Sin ella, el cliente que la IA acaba de pasar a una
 *     persona —justo el que se olvida— no entraría a «Esperando» hasta volver
 *     a escribir.
 *  3. **Llegó después de la última salida del equipo** (`last_team_out_at`,
 *     076): cuenta cualquier camino de persona y ninguno automático.
 *  4. **Todavía se le puede contestar con texto libre**: la ventana del canal
 *     o, en Instagram y Messenger, la extensión de agente humano (7 días).
 *     Con la ventana cerrada ya no se le contesta sin plantilla, y taparía a
 *     las que sí se pueden atender.
 *
 * El tiempo de espera cuenta desde el PRIMER mensaje del cliente que nadie
 * contestó: si escribe tres veces seguidas, la espera no vuelve a cero.
 *
 * Aquí viven la regla en TypeScript puro (las pruebas unitarias) y su gemela
 * en SQL (`esperaDesdeSql`), que es la que corre. Las dos se leen igual.
 */

const DIA_MS = 24 * 3_600_000;

/** Hasta cuándo, desde el último entrante, puede contestar una persona en ese canal. */
function plazoDeLaPersona(channel: Channel): number {
  return Math.max(windowMsFor(channel), capabilitiesFor(channel).humanAgentWindowMs ?? 0);
}

/** La ventana más larga de cualquier canal (finita): acota la consulta. */
export const VENTANA_MAXIMA_MS = Math.max(
  ...(Object.keys(CHANNEL_CAPABILITIES) as Channel[])
    .map(plazoDeLaPersona)
    .filter((ms) => Number.isFinite(ms)),
  7 * DIA_MS
);

export type ConversacionParaEspera = {
  isTest: boolean;
  aiEnabled: boolean;
  handoffAt: Date | null;
  lastInboundAt: Date | null;
  lastTeamOutAt: Date | null;
};

export type MensajeParaEspera = {
  direction: "in" | "out";
  status: string;
  aiGenerated: boolean;
  createdAt: Date;
};

/** (1) ¿Solo una persona le puede contestar? */
export function necesitaPersona(c: Pick<ConversacionParaEspera, "aiEnabled" | "handoffAt">): boolean {
  return c.handoffAt !== null || !c.aiEnabled;
}

/**
 * (2) El primer mensaje del cliente sin respuesta, o null si lo último que
 * pasó es una respuesta. Gemela de `esperaDesdeSql`.
 *
 * Una respuesta es un saliente que no falló. Con traspaso abierto, lo que
 * escribió la IA desde el mensaje del cliente que la hizo escalar (el último
 * entrante anterior al traspaso) no cuenta: es la despedida.
 */
export function primerMensajeSinRespuesta(
  mensajes: readonly MensajeParaEspera[],
  handoffAt: Date | null
): Date | null {
  const entrantes = mensajes.filter((m) => m.direction === "in");
  let corte: number | null = null;
  if (handoffAt) {
    const antes = entrantes
      .map((m) => m.createdAt.getTime())
      .filter((t) => t <= handoffAt.getTime());
    corte = antes.length ? Math.max(...antes) : handoffAt.getTime();
  }
  let ultimaRespuesta = -Infinity;
  for (const m of mensajes) {
    if (m.direction !== "out" || m.status === "failed") continue;
    const t = m.createdAt.getTime();
    if (m.aiGenerated && corte !== null && t >= corte) continue;
    ultimaRespuesta = Math.max(ultimaRespuesta, t);
  }
  const sinRespuesta = entrantes
    .map((m) => m.createdAt.getTime())
    .filter((t) => t > ultimaRespuesta);
  return sinRespuesta.length ? new Date(Math.min(...sinRespuesta)) : null;
}

/**
 * (4) Hasta cuándo una persona puede contestarle con texto libre: lo mismo que
 * `replyWindow(...).operatorOpen` (`inbox/window.ts`). Un canal sin ventana
 * se acota a la más larga, para que la espera no dure para siempre.
 */
export function contestableHasta(channel: Channel, lastInboundAt: Date): Date {
  const plazo = plazoDeLaPersona(channel);
  return new Date(lastInboundAt.getTime() + (Number.isFinite(plazo) ? plazo : VENTANA_MAXIMA_MS));
}

/**
 * La regla completa sobre datos en memoria (pruebas). En producción la parte
 * (2) la calcula la base con `esperaDesdeSql` y aquí solo entra su resultado.
 */
export function calcularEspera(
  c: ConversacionParaEspera & { channel: Channel },
  mensajes: readonly MensajeParaEspera[],
  opts: { ahora: Date }
): EsperaDto | null {
  if (c.isTest || !c.lastInboundAt) return null;
  if (!necesitaPersona(c)) return null;
  if (c.lastTeamOutAt && c.lastInboundAt.getTime() <= c.lastTeamOutAt.getTime()) return null;
  const desde = primerMensajeSinRespuesta(mensajes, c.handoffAt);
  return esperaConVentana(c, desde, opts);
}

/** (4) sobre lo que ya calculó la base: el DTO, o null si la ventana cerró. */
export function esperaConVentana(
  c: { channel: Channel; lastInboundAt: Date | null },
  desde: Date | null,
  opts: { ahora: Date }
): EsperaDto | null {
  if (!desde || !c.lastInboundAt) return null;
  const hasta = contestableHasta(c.channel, c.lastInboundAt);
  if (opts.ahora.getTime() >= hasta.getTime()) return null;
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

/**
 * Gemela en SQL de (1)+(2)+(3): desde cuándo espera, en ISO, o NULL.
 *
 * El `case` corta antes de las subconsultas: solo corren para las que
 * necesitan a una persona y tienen un mensaje del cliente reciente sin
 * respuesta del equipo. Las tres van por `message_org_conv_idx`
 * (`organization_id, conversation_id, created_at`), con `organization_id`
 * primero: sin él Postgres recorre los mensajes de todas las organizaciones.
 */
export function esperaDesdeSql(opts: { ahora: Date }): SQL<string | null> {
  const c = schema.conversation;
  const limite = new Date(opts.ahora.getTime() - VENTANA_MAXIMA_MS).toISOString();
  return sql<string | null>`case when ${c.isTest} = false
      and ${c.lastInboundAt} is not null
      and ${c.lastInboundAt} > ${limite}::timestamp
      and (${c.lastTeamOutAt} is null or ${c.lastInboundAt} > ${c.lastTeamOutAt})
      and (${c.handoffAt} is not null or ${c.aiEnabled} = false)
    then (
      select to_char(min(cli.created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      from (
        select max(r.created_at) as t
        from (
          select coalesce((
            select max(t.created_at) from message t
            where t.organization_id = ${c.organizationId}
              and t.conversation_id = ${c.id}
              and t.direction = 'in'
              and t.created_at <= ${c.handoffAt}
          ), ${c.handoffAt}) as corte
        ) k
        join message r
          on r.organization_id = ${c.organizationId}
         and r.conversation_id = ${c.id}
        where r.direction = 'out'
          and r.status <> 'failed'
          and (r.ai_generated = false or ${c.handoffAt} is null or r.created_at < k.corte)
      ) resp
      join message cli
        on cli.organization_id = ${c.organizationId}
       and cli.conversation_id = ${c.id}
      where cli.direction = 'in'
        and cli.created_at > coalesce(resp.t, '-infinity'::timestamp)
    )
    end`;
}

/** El texto ISO que devuelve `esperaDesdeSql`, como fecha. */
export function aFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}
