import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import { resolveIdentity } from "@/server/inbox/identity";
import type {
  WebhookMediaPayload,
  WebhookMessage,
  WebhookValue,
} from "@/server/inbox/webhook";

/**
 * 074 — Mensajes editados en WhatsApp (`type: "edit"`, coexistencia).
 *
 * Una edición no es un mensaje nuevo: cambia el texto (o el pie) del que ya
 * está, guarda lo que decía la PRIMERA vez y avisa en vivo
 * (`message.updated`). No cuenta como no leído, no abre ni renueva la
 * ventana de 24 h y no despierta al cerebro. Jamás lanza: una edición rara no
 * tumba el webhook.
 *
 * Meta la manda con un id NUEVO y `edit.original_message_id` = el `wamid`
 * editado; `edit.message` trae el contenido nuevo con la forma de siempre.
 */

const TIPOS_CON_PIE = new Set(["image", "video", "document"]);

export type Edicion = {
  /** `wamid` del mensaje editado. */
  originalId: string;
  /** Texto nuevo (cuerpo de un texto o pie de un adjunto). */
  texto: string;
  /** true si lo editado es el pie de un adjunto. */
  esPie: boolean;
  /** Hora de la edición según Meta. */
  fecha: Date;
};

/** Lee el evento de edición. null si le falta lo indispensable. Pura. */
export function extraerEdicion(msg: WebhookMessage): Edicion | null {
  if (msg.type !== "edit") return null;
  const originalId = msg.edit?.original_message_id;
  const nuevo = msg.edit?.message;
  if (!originalId || !nuevo) return null;
  let texto: string | undefined;
  let esPie = false;
  if (typeof nuevo.text?.body === "string") {
    texto = nuevo.text.body;
  } else if (nuevo.type && TIPOS_CON_PIE.has(nuevo.type)) {
    const media = nuevo[nuevo.type as "image" | "video" | "document"] as
      | WebhookMediaPayload
      | undefined;
    texto = media?.caption;
    esPie = true;
  }
  if (typeof texto !== "string") return null;
  const n = Number(msg.timestamp);
  const fecha = Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
  return { originalId, texto, esPie, fecha };
}

/**
 * ¿Esta edición pisa el estado actual? Meta puede repetir o desordenar
 * eventos: gana la más reciente, y repetir la misma no cambia nada. Pura.
 */
export function debeAplicarse(editadoEn: Date | null, fecha: Date): boolean {
  return !editadoEn || fecha.getTime() >= editadoEn.getTime();
}

/**
 * Aplica una edición del cliente (webhook `messages`) o del negocio desde el
 * teléfono (eco). `quien` decide qué mensajes puede tocar: el cliente solo
 * sus entrantes, el negocio solo sus salientes. Siempre dentro de la
 * organización que resolvió el número y en conversaciones de WhatsApp.
 */
export async function registrarEdicionWhatsApp(
  organizationId: string,
  msg: WebhookMessage,
  quien: { tipo: "cliente"; contacts: WebhookValue["contacts"] } | { tipo: "negocio" }
): Promise<void> {
  try {
    const edicion = extraerEdicion(msg);
    if (!edicion) {
      console.warn(`[ediciones] edición ${msg.id} sin mensaje original o sin texto: ignorada`);
      return;
    }
    const db = getDb();
    const [fila] = await db
      .select({
        message: schema.message,
        conversation: schema.conversation,
        contact: schema.contact,
      })
      .from(schema.message)
      .innerJoin(
        schema.conversation,
        and(
          eq(schema.conversation.organizationId, schema.message.organizationId),
          eq(schema.conversation.id, schema.message.conversationId)
        )
      )
      .innerJoin(
        schema.contact,
        and(
          eq(schema.contact.organizationId, schema.conversation.organizationId),
          eq(schema.contact.id, schema.conversation.contactId)
        )
      )
      .where(
        scoped(
          schema.message.organizationId,
          organizationId,
          and(
            eq(schema.message.waMessageId, edicion.originalId),
            eq(schema.conversation.channel, "whatsapp")
          )
        )
      )
      .limit(1);
    if (!fila) {
      console.log(`[ediciones] edición ${msg.id} de un mensaje que no está en el CRM: ignorada`);
      return;
    }

    if (quien.tipo === "cliente") {
      const id = resolveIdentity(msg, quien.contacts);
      const esElAutor =
        fila.message.direction === "in" &&
        !!id &&
        (id.identity === fila.contact.waIdentity ||
          (!!id.phone && id.phone === fila.contact.phone) ||
          (!!id.waUserId && id.waUserId === fila.contact.waUserId));
      if (!esElAutor) {
        console.warn(`[ediciones] edición ${msg.id} de alguien que no es el autor: ignorada`);
        return;
      }
    } else if (fila.message.direction !== "out") {
      console.warn(`[ediciones] eco de edición ${msg.id} sobre un mensaje del cliente: ignorado`);
      return;
    }

    if (!debeAplicarse(fila.message.editedAt, edicion.fecha)) return;

    const assetId = fila.message.mediaAssetId;
    const esPie = edicion.esPie && !!assetId;
    let textoAntes: string | null = fila.message.text;
    let caption: string | null = null;
    if (esPie) {
      const [asset] = await db
        .select({ caption: schema.mediaAsset.caption })
        .from(schema.mediaAsset)
        .where(
          scoped(schema.mediaAsset.organizationId, organizationId, eq(schema.mediaAsset.id, assetId))
        )
        .limit(1);
      textoAntes = asset?.caption ?? null;
      caption = edicion.texto;
      await db
        .update(schema.mediaAsset)
        .set({ caption, updatedAt: new Date() })
        .where(
          scoped(schema.mediaAsset.organizationId, organizationId, eq(schema.mediaAsset.id, assetId))
        );
    }

    // Se guarda la PRIMERA versión: es la que el equipo pudo haber leído y
    // contestado. Las ediciones siguientes solo cambian el texto vigente.
    const originalText = fila.message.editedAt ? fila.message.originalText : textoAntes;
    const text = esPie ? fila.message.text : edicion.texto;
    await db
      .update(schema.message)
      .set({ text, editedAt: edicion.fecha, originalText })
      .where(
        scoped(schema.message.organizationId, organizationId, eq(schema.message.id, fila.message.id))
      );

    publish(organizationId, {
      type: "message.updated",
      data: {
        conversationId: fila.conversation.id,
        messageId: fila.message.id,
        text,
        caption,
        editedAt: edicion.fecha.toISOString(),
        originalText,
      },
    });
  } catch (err) {
    console.error(`[ediciones] no se pudo registrar la edición ${msg.id}:`, err);
  }
}
