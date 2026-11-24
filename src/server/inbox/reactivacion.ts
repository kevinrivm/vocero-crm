import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { addDaysISO, todayInTz, tzOffsetMinutes, zonedWallClockToUtc } from "@/lib/time/slots";

/**
 * 076 — La IA vuelve sola a una conversación en pausa.
 *
 * Antes una pausa no caducaba nunca: si el agente escalaba o alguien del
 * equipo contestaba, ese cliente se quedaba sin IA para siempre, aunque nadie
 * le volviera a escribir. Ahora, cuando el CLIENTE escribe (no con un
 * temporizador: así la ventana de 24 h siempre está abierta cuando la IA
 * vuelve) se revisa:
 *
 *  · Traspaso a una persona (`handoff_at`): vuelve si el equipo lleva N horas
 *    sin escribir. N es del negocio (`agent_profile.reactivate_after_hours`);
 *    NULL = nunca. Nunca tras hostilidad.
 *  · Pausa manual con fecha (`ai_paused_until`): vuelve si ya venció. Sin
 *    fecha es indefinida.
 *  · Nunca en una conversación de prueba ni con el agente apagado.
 *
 * `last_team_out_at` cuida que no vuelva a una conversación que el equipo
 * sigue llevando: cuenta CUALQUIER salida de una persona (Bandeja, API v1, eco
 * del teléfono) y ninguna automática.
 */

/** Un perfil nuevo nace con esto; el de una instalación que actualiza, en NULL. */
export const HORAS_REACTIVACION_NUEVAS = 24;
/** Tope del ajuste: un mes. Más que eso es «nunca» con otro nombre. */
export const HORAS_REACTIVACION_MAX = 720;
/** «Hasta mañana» termina a esta hora, en la zona del negocio: cuando vuelve el equipo. */
export const HORA_FIN_HASTA_MANANA = "09:00";

/**
 * Motivos de traspaso tras los que la IA puede volver sola. Fuera queda la
 * hostilidad: el agente se retiró a propósito.
 */
export const MOTIVOS_QUE_VUELVEN = [
  "cliente",
  "modelo",
  "error",
  "ventana",
  "manual_reply",
  "sin_respuesta",
] as const;

export type MotivoVuelta = "sin_equipo" | "pausa_vencida";

export type EstadoPausa = {
  isTest: boolean;
  aiEnabled: boolean;
  handoffAt: Date | null;
  handoffReason: string | null;
  aiPausedUntil: Date | null;
  lastTeamOutAt: Date | null;
};

export type Vuelta = { motivo: MotivoVuelta; horas: number | null };

const HORA = 3_600_000;

/**
 * Pura: ¿vuelve la IA con el mensaje que acaba de escribir el cliente?
 *
 * Dos pausas distintas, que se leen así:
 *  · Traspaso (`handoff_at`): lo abre el agente al escalar o una persona al
 *    contestar. Contestar también apaga `ai_enabled`, así que con traspaso esa
 *    bandera no dice nada; lo que manda es la regla de las N horas. Si además
 *    hay una pausa con fecha todavía vigente (el dueño pausó una hora y luego
 *    contestó), se espera a que venza.
 *  · Pausa manual del panel (`ai_enabled = false` sin traspaso): con fecha,
 *    vuelve al vencer; sin fecha es indefinida. Contestar dentro de una pausa
 *    indefinida no abre traspaso (`pausa-manual.ts`), así que la indefinida se
 *    respeta aunque el equipo escriba.
 */
export function decidirVuelta(
  c: EstadoPausa,
  opts: { horas: number | null; now: Date }
): Vuelta | null {
  if (c.isTest) return null;
  const traspaso = c.handoffAt !== null;
  if (c.aiEnabled && !traspaso) return null;

  const horas = opts.horas !== null && opts.horas > 0 ? opts.horas : null;
  const now = opts.now.getTime();
  const vigente = c.aiPausedUntil !== null && now < c.aiPausedUntil.getTime();
  const equipoReciente = (desde: number) =>
    horas !== null && now - Math.max(desde, c.lastTeamOutAt?.getTime() ?? 0) < horas * HORA;

  if (traspaso) {
    if (vigente) return null;
    if (!(MOTIVOS_QUE_VUELVEN as readonly string[]).includes(c.handoffReason ?? "")) return null;
    if (horas === null) return null;
    if (equipoReciente(c.handoffAt!.getTime())) return null;
    return { motivo: "sin_equipo", horas };
  }

  // Pausa manual sin traspaso: sin fecha es indefinida; con fecha, hasta que
  // venza. Si alguien del equipo escribió en las últimas N horas, sigue
  // siendo suya.
  if (c.aiPausedUntil === null || vigente) return null;
  if (equipoReciente(0)) return null;
  return { motivo: "pausa_vencida", horas: null };
}

export type DuracionPausa = "1h" | "manana" | "indefinida";

/** Antes de esta hora local todavía es «esta noche»: «hasta mañana» es hoy a las 9:00. */
const FIN_DE_LA_MADRUGADA = 5;

/**
 * Fin de una pausa manual. «Hasta mañana» es las 9:00 en la zona del negocio
 * (la de su agenda), no la del servidor: quien pausa «hasta mañana» quiere que
 * la IA no conteste de noche y que el chat siga con su equipo cuando abra. Si
 * se pausa de madrugada (antes de las 5:00), «mañana» es la mañana de ese
 * mismo día, no la del siguiente.
 */
export function finDePausa(duracion: DuracionPausa, tz: string, now = new Date()): Date | null {
  if (duracion === "indefinida") return null;
  if (duracion === "1h") return new Date(now.getTime() + HORA);
  const horaLocal = new Date(now.getTime() + tzOffsetMinutes(now, tz) * 60_000).getUTCHours();
  const hoy = todayInTz(now, tz);
  const dia = horaLocal < FIN_DE_LA_MADRUGADA ? hoy : addDaysISO(hoy, 1);
  return zonedWallClockToUtc(dia, HORA_FIN_HASTA_MANANA, tz) ?? new Date(now.getTime() + 24 * HORA);
}

/**
 * Una persona del equipo le escribió al cliente: se anota la hora.
 *
 * `greatest` y no un simple SET: un eco que llega tarde (un mensaje de hace
 * un rato) no puede retroceder la marca.
 */
export async function anotarSalidaDelEquipo(
  organizationId: string,
  conversationId: string,
  at: Date = new Date()
): Promise<void> {
  const c = schema.conversation;
  const ts = at.toISOString();
  await getDb()
    .update(c)
    .set({
      lastTeamOutAt: sql`greatest(coalesce(${c.lastTeamOutAt}, ${ts}::timestamp), ${ts}::timestamp)`,
    })
    .where(scoped(c.organizationId, organizationId, eq(c.id, conversationId)));
}

/**
 * El ajuste del negocio (NULL = nunca) y si su agente está encendido. Con el
 * agente apagado en la pantalla Agente la IA no «vuelve» a ningún lado: el
 * hilo diría que volvió y nadie contestaría.
 */
async function ajusteDeReactivacion(organizationId: string) {
  const p = schema.agentProfile;
  const [row] = await getDb()
    .select({ horas: p.reactivateAfterHours, encendido: p.enabled })
    .from(p)
    .where(scoped(p.organizationId, organizationId))
    .limit(1);
  return { horas: row?.horas ?? null, encendido: row?.encendido ?? false };
}

/**
 * Levanta la pausa si toca. Devuelve la vuelta, o null si la IA sigue en pausa.
 *
 * Con la fila bloqueada (`FOR UPDATE`): una persona que contesta en el mismo
 * instante espera a que esto termine y vuelve a pausar, o ya pausó y aquí se
 * ve. Nunca lanza: un fallo deja la conversación en pausa, que es lo de antes.
 */
export async function devolverALaIaSiToca(
  organizationId: string,
  conversationId: string,
  now: Date = new Date()
): Promise<Vuelta | null> {
  try {
    const { horas, encendido } = await ajusteDeReactivacion(organizationId);
    if (!encendido) return null;
    const c = schema.conversation;
    return await getDb().transaction(async (tx) => {
      const [conv] = await tx
        .select()
        .from(c)
        .where(scoped(c.organizationId, organizationId, eq(c.id, conversationId)))
        .for("update");
      if (!conv) return null;
      const vuelta = decidirVuelta(conv, { horas, now });
      if (!vuelta) return null;
      await tx
        .update(c)
        .set({
          aiEnabled: true,
          handoffAt: null,
          handoffReason: null,
          aiPausedUntil: null,
          updatedAt: now,
        })
        .where(scoped(c.organizationId, organizationId, eq(c.id, conversationId)));
      await tx.insert(schema.iaVuelta).values({
        id: newId("iaVuelta"),
        organizationId,
        conversationId,
        motivo: vuelta.motivo,
        horas: vuelta.horas,
        pausadaDesde: conv.handoffAt,
        motivoPausa: conv.handoffReason,
        occurredAt: now,
      });
      console.info(
        `[ia] la IA volvió sola a ${conversationId} (${vuelta.motivo}${vuelta.horas ? `, ${vuelta.horas} h` : ""})`
      );
      return vuelta;
    });
  } catch (err) {
    console.warn(
      `[ia] no se pudo evaluar si la IA vuelve a ${conversationId}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/** Las vueltas de una conversación, para el hilo. */
export async function vueltasDeConversacion(organizationId: string, conversationId: string) {
  const v = schema.iaVuelta;
  return getDb()
    .select()
    .from(v)
    .where(scoped(v.organizationId, organizationId, eq(v.conversationId, conversationId)))
    .orderBy(v.occurredAt);
}
