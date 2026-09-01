import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { sendBusinessMessagingEvent } from "@/lib/meta/capi";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import { atribucionEnabled } from "@/server/attribution/flag";
import { getCapiSettings } from "@/server/attribution/settings";
import { getAttributionForConversation } from "@/server/attribution/store";
import { createLogger } from "@/lib/logger";

const log = createLogger("capi");

/**
 * 016 — Reporte de conversiones a Meta.
 *
 * Tres reglas duras, y ninguna es opcional:
 *
 * 1. **Dedup en la base**, no en el código: la fila se inserta ANTES de hablar
 *    con Meta, con `ON CONFLICT DO NOTHING` sobre (org, conversación, evento).
 *    A Meta no se le puede des-enviar una compra.
 * 2. **Best-effort absoluto**: nada de lo que pase aquí —Meta caído, token
 *    vencido, dataset sin configurar— puede impedir que el lead se mueva de
 *    etapa. Se registra el desenlace y se sigue.
 * 3. **Todo intento deja rastro**: `sent`, `failed` o `skipped` con el motivo
 *    escrito. Las filas `skipped` son la respuesta a "¿por qué este lead no
 *    aparece en Meta?", que sin ellas se contesta adivinando.
 */

/** Los dos eventos que Vocero emite (nombres del catálogo de Meta, tal cual). */
export const QUALIFIED_EVENT = "QualifiedLead";
export const PURCHASE_EVENT = "Purchase";

const NO_CLID_REASON =
  "sin ctwa_clid: la conversación no vino de un anuncio de WhatsApp";
const NOT_CONFIGURED_REASON =
  "atribución no configurada: falta el dataset de Meta o la conexión de WhatsApp";

type EmitOutcome = "sent" | "failed" | "skipped" | "dedup" | "error";

/**
 * Reporta un evento de una conversación. Público para que un fork pueda emitir
 * los suyos (p. ej. el espejo `InitiateCheckout` que documenta la guía) sin
 * reimplementar el dedup ni el manejo del acuse.
 */
export async function emitConversion(
  organizationId: string,
  conversationId: string,
  eventName: string,
  customData?: Record<string, unknown>
): Promise<EmitOutcome> {
  try {
    const db = getDb();

    // Dedup atómico: si ya existe ese evento para esta conversación, no-op.
    const inserted = await db
      .insert(schema.conversionEvent)
      .values({
        id: newId("conversionEvent"),
        organizationId,
        conversationId,
        eventName,
      })
      .onConflictDoNothing({
        target: [
          schema.conversionEvent.organizationId,
          schema.conversionEvent.conversationId,
          schema.conversionEvent.eventName,
        ],
      })
      .returning();

    const event = inserted[0];
    if (!event) return "dedup";

    const attribution = await getAttributionForConversation(
      organizationId,
      conversationId
    );
    const settings = await getCapiSettings(organizationId);
    const credentials = await getCredentialsByOrg(organizationId);

    if (!attribution?.ctwaClid || !settings || !credentials) {
      await db
        .update(schema.conversionEvent)
        .set({
          status: "skipped",
          attributionId: attribution?.id ?? null,
          error: !attribution?.ctwaClid ? NO_CLID_REASON : NOT_CONFIGURED_REASON,
        })
        .where(eq(schema.conversionEvent.id, event.id));
      return "skipped";
    }

    try {
      const ack = await sendBusinessMessagingEvent({
        datasetId: settings.datasetId,
        token: settings.token,
        event: {
          eventName,
          eventTime: Math.floor(Date.now() / 1000),
          ctwaClid: attribution.ctwaClid,
          wabaId: credentials.wabaId,
          customData,
        },
      });
      await db
        .update(schema.conversionEvent)
        .set({
          status: "sent",
          attributionId: attribution.id,
          sentAt: new Date(),
          fbTraceId: ack.fbTraceId,
          error: null,
        })
        .where(eq(schema.conversionEvent.id, event.id));
      return "sent";
    } catch (err) {
      await db
        .update(schema.conversionEvent)
        .set({
          status: "failed",
          attributionId: attribution.id,
          error: err instanceof Error ? err.message : String(err),
        })
        .where(eq(schema.conversionEvent.id, event.id));
      log.warn("fallo al reportar conversión", { eventName, conversationId, err });
      return "failed";
    }
  } catch (err) {
    // Best-effort absoluto: ni siquiera un fallo de la base puede tumbar a
    // quien nos llamó (mover un lead de etapa).
    log.warn("emitConversion falló", { eventName, err });
    return "error";
  }
}

/**
 * `custom_data` de un `Purchase` a partir del monto del trato. Pura y exportada
 * para fijar en un test la conversión centavos → unidades: Meta espera unidades
 * de la moneda (450.50) y la base guarda centavos enteros (45050).
 *
 * Sin monto (o en cero) devuelve solo la etapa: la venta se cuenta igual, pero
 * sin precio. Mandar `value: 0` no significa "no sé cuánto" — le enseña al
 * optimizador que las ventas de este negocio valen nada.
 */
export function purchaseCustomData(amount: {
  amountCents: number | null;
  currency: string | null;
}): Record<string, unknown> {
  const base = { lead_stage: "won" };
  if (amount.amountCents === null || amount.amountCents <= 0) return base;
  return {
    ...base,
    value: amount.amountCents / 100,
    ...(amount.currency ? { currency: amount.currency } : {}),
  };
}

/**
 * Punto de entrada desde la puerta única de etapas.
 *
 * Vive aquí y no en `stage-history.ts` para que aquel archivo siga siendo lo
 * que dice ser: la puerta que escribe `stage_id`. Y cuelga de esa puerta —y no
 * de donde el bot escribe la ficha, como en el fork del que viene esta idea—
 * porque así reportan IGUAL los cuatro caminos que mueven un lead: el dueño
 * arrastrando, el agente incluido, un cerebro externo por `/api/bot/*` y
 * cualquier quinto camino que alguien agregue mañana.
 */
export async function reportStageChange(input: {
  organizationId: string;
  leadId: string;
  contactId: string;
  toStageId: string;
  toStageKind: "open" | "won" | "lost";
}): Promise<void> {
  if (!atribucionEnabled()) return;

  try {
    const settings = await getCapiSettings(input.organizationId);
    const isQualified =
      settings?.qualifiedStageId != null &&
      settings.qualifiedStageId === input.toStageId;
    const isWon = input.toStageKind === "won";
    if (!isQualified && !isWon) return;

    const db = getDb();
    // La conversación REAL del contacto (índice único parcial: una por
    // contacto). Las del Laboratorio (`is_test`) no entran aquí — mismo
    // guardrail que el sender: una conversación de prueba jamás toca el
    // mundo real.
    const rows = await db
      .select({
        conversationId: schema.conversation.id,
        amountCents: schema.lead.amountCents,
        currency: schema.lead.currency,
      })
      .from(schema.lead)
      .innerJoin(
        schema.conversation,
        and(
          eq(schema.conversation.organizationId, schema.lead.organizationId),
          eq(schema.conversation.contactId, schema.lead.contactId),
          eq(schema.conversation.isTest, false)
        )
      )
      .where(
        scoped(
          schema.lead.organizationId,
          input.organizationId,
          eq(schema.lead.id, input.leadId)
        )
      )
      .limit(1);

    const row = rows[0];
    // Sin conversación de WhatsApp no hay `ctwa_clid` posible ni nada que
    // atribuir (p. ej. un prospecto capturado a mano que nunca escribió).
    if (!row) return;

    if (isWon) {
      await emitConversion(
        input.organizationId,
        row.conversationId,
        PURCHASE_EVENT,
        purchaseCustomData(row)
      );
      return;
    }

    await emitConversion(
      input.organizationId,
      row.conversationId,
      QUALIFIED_EVENT,
      { lead_stage: "qualified" }
    );
  } catch (err) {
    log.warn("reportStageChange falló", { leadId: input.leadId, err });
  }
}

/* ---------------- Actividad reciente (solo lectura) ---------------- */

export type ConversionActivityRow = {
  id: string;
  conversationId: string;
  eventName: string;
  /** Nombre del contacto; null si la conversación ya no existe. */
  contactName: string | null;
  /** Titular del anuncio de origen, si se capturó. */
  adHeadline: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  /** Momento a mostrar: el envío si ocurrió, si no la creación. */
  at: string;
  fbTraceId: string | null;
  error: string | null;
};

/** Tope duro: es un panel de monitoreo, no un export. */
const ACTIVITY_MAX_LIMIT = 50;
export const ACTIVITY_DEFAULT_LIMIT = 25;

/** Pura y exportada para probar el fallback de fecha sin tocar la base. */
export function toConversionActivityRow(row: {
  id: string;
  conversationId: string;
  eventName: string;
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  fbTraceId: string | null;
  sentAt: Date | null;
  createdAt: Date;
  contactName: string | null;
  adHeadline: string | null;
}): ConversionActivityRow {
  return {
    id: row.id,
    conversationId: row.conversationId,
    eventName: row.eventName,
    contactName: row.contactName,
    adHeadline: row.adHeadline,
    status: row.status,
    at: (row.sentAt ?? row.createdAt).toISOString(),
    fbTraceId: row.fbTraceId,
    error: row.error,
  };
}

/** Últimas conversiones de la organización, la más reciente primero. */
export async function listConversionActivity(
  organizationId: string,
  limit = ACTIVITY_DEFAULT_LIMIT
): Promise<ConversionActivityRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.conversionEvent.id,
      conversationId: schema.conversionEvent.conversationId,
      eventName: schema.conversionEvent.eventName,
      status: schema.conversionEvent.status,
      error: schema.conversionEvent.error,
      fbTraceId: schema.conversionEvent.fbTraceId,
      sentAt: schema.conversionEvent.sentAt,
      createdAt: schema.conversionEvent.createdAt,
      contactName: schema.contact.name,
      adHeadline: schema.adAttribution.headline,
    })
    .from(schema.conversionEvent)
    .leftJoin(
      schema.conversation,
      eq(schema.conversation.id, schema.conversionEvent.conversationId)
    )
    .leftJoin(
      schema.contact,
      eq(schema.contact.id, schema.conversation.contactId)
    )
    .leftJoin(
      schema.adAttribution,
      eq(schema.adAttribution.conversationId, schema.conversionEvent.conversationId)
    )
    .where(scoped(schema.conversionEvent.organizationId, organizationId))
    .orderBy(desc(schema.conversionEvent.createdAt))
    .limit(Math.min(Math.max(limit, 1), ACTIVITY_MAX_LIMIT));

  return rows.map(toConversionActivityRow);
}
