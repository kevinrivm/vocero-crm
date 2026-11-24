import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { MetaApiError, normalizeMx, normalizeRecipient } from "@/lib/meta/client";
import { destinatarioMeta } from "@/lib/meta/destinatario";
import type { Channel } from "@/lib/channels";
import {
  canalReacciona,
  esReaccionable,
  idZernioDe,
  MOTIVO_VENTANA_CERRADA,
  type ReaccionDto,
} from "@/lib/reacciones";
import { publish } from "@/server/events/bus";
import { isChannelEnabled } from "@/server/channels/enabled";
import { FB_PREFIX, IG_PREFIX, resolveIdentity } from "@/server/inbox/identity";
import type { WebhookMessage, WebhookValue } from "@/server/inbox/webhook";
import { replyWindow } from "@/server/inbox/window";
import { callGraphSend, SendError } from "@/server/inbox/send";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import {
  getInstagramCredentialsByOrg,
  markInstagramReconnectRequired,
} from "@/server/instagram/credentials";
import {
  getMessengerCredentialsByOrg,
  markMessengerReconnectRequired,
} from "@/server/messenger/credentials";
import { reactZernioMessage, type ZernioEvent } from "@/server/zernio";
import { findZernioConnection } from "@/server/zernio/conexiones";

/**
 * 072 — Reacciones a mensajes: las del cliente que llegan por webhook y las
 * del equipo que salen desde la bandeja (puerto de la 150 de Megaparty).
 *
 * Reglas: una reacción por actor y mensaje (el equipo es UN actor, como lo ve
 * el cliente); emoji vacío = quitar; una reacción a un mensaje que no está en
 * el CRM se ignora; la IA nunca reacciona (no hay camino desde `/api/bot/*`
 * ni desde la API v1).
 */

export class ReaccionError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "sandbox_violation"
      | "window_closed"
      | "not_connected"
      | "reconnect_required"
      | "reaction_unavailable"
      | "meta_error"
      | "meta_unavailable",
    message: string
  ) {
    super(message);
    this.name = "ReaccionError";
  }
}

export const REACCION_ERROR_STATUS: Record<ReaccionError["code"], number> = {
  not_found: 404,
  sandbox_violation: 403,
  window_closed: 409,
  not_connected: 409,
  reconnect_required: 409,
  reaction_unavailable: 422,
  meta_error: 422,
  meta_unavailable: 503,
};

/** Las reacciones de varios mensajes, en un solo query. */
export async function reaccionesDe(
  organizationId: string,
  messageIds: readonly string[]
): Promise<Map<string, ReaccionDto[]>> {
  const out = new Map<string, ReaccionDto[]>();
  if (messageIds.length === 0) return out;
  const filas = await getDb()
    .select({
      r: schema.messageReaction,
      usuario: schema.user.name,
      contacto: schema.contact.name,
    })
    .from(schema.messageReaction)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.messageReaction.conversationId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .leftJoin(schema.user, eq(schema.user.id, schema.messageReaction.userId))
    .where(
      scoped(
        schema.messageReaction.organizationId,
        organizationId,
        inArray(schema.messageReaction.messageId, [...messageIds])
      )
    )
    .orderBy(schema.messageReaction.createdAt);
  for (const f of filas) {
    const lista = out.get(f.r.messageId) ?? [];
    lista.push({
      emoji: f.r.emoji,
      actor: f.r.actor,
      nombre: f.r.actor === "equipo" ? (f.usuario ?? "Tu equipo") : (f.contacto ?? null),
    });
    out.set(f.r.messageId, lista);
  }
  return out;
}

/** Pone, cambia o quita (emoji "") la reacción de un actor, y avisa en vivo. */
async function guardarReaccion(input: {
  organizationId: string;
  conversationId: string;
  messageId: string;
  actor: "cliente" | "equipo";
  emoji: string;
  userId: string | null;
}): Promise<ReaccionDto[]> {
  const db = getDb();
  if (input.emoji) {
    await db
      .insert(schema.messageReaction)
      .values({
        id: newId("messageReaction"),
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        actor: input.actor,
        userId: input.userId,
        emoji: input.emoji,
      })
      .onConflictDoUpdate({
        target: [schema.messageReaction.messageId, schema.messageReaction.actor],
        set: { emoji: input.emoji, userId: input.userId, updatedAt: new Date() },
      });
  } else {
    await db
      .delete(schema.messageReaction)
      .where(
        and(
          eq(schema.messageReaction.organizationId, input.organizationId),
          eq(schema.messageReaction.messageId, input.messageId),
          eq(schema.messageReaction.actor, input.actor)
        )
      );
  }
  const reactions =
    (await reaccionesDe(input.organizationId, [input.messageId])).get(input.messageId) ?? [];
  publish(input.organizationId, {
    type: "reaction.updated",
    data: { conversationId: input.conversationId, messageId: input.messageId, reactions },
  });
  return reactions;
}

/** El mensaje (con su conversación y contacto) por su id en la plataforma. */
async function mensajePorIdPlataforma(
  organizationId: string,
  candidatos: string[],
  channel: Channel
) {
  if (candidatos.length === 0) return null;
  const [fila] = await getDb()
    .select({ message: schema.message, conversation: schema.conversation, contact: schema.contact })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        inArray(schema.message.waMessageId, candidatos),
        eq(schema.conversation.channel, channel)
      )
    )
    .limit(1);
  return fila ?? null;
}

/**
 * Reacción del cliente por WhatsApp (mensaje `type: "reaction"` del webhook).
 * Jamás lanza: una reacción rara no tumba el webhook.
 */
export async function registrarReaccionWhatsApp(
  organizationId: string,
  msg: WebhookMessage,
  contacts: WebhookValue["contacts"]
): Promise<void> {
  try {
    const objetivo = msg.reaction?.message_id;
    if (!objetivo) return;
    const fila = await mensajePorIdPlataforma(organizationId, [objetivo], "whatsapp");
    if (!fila) {
      console.log(`[reacciones] reacción a un mensaje que no está en el CRM (${msg.id}): ignorada`);
      return;
    }
    // Solo el cliente de ESA conversación reacciona a sus mensajes.
    const quien = resolveIdentity(msg, contacts);
    const esElCliente =
      !!quien &&
      (quien.identity === fila.contact.waIdentity ||
        (!!quien.phone && !!fila.contact.phone && normalizeMx(fila.contact.phone) === quien.phone) ||
        (!!quien.waUserId && quien.waUserId === fila.contact.waUserId));
    if (!esElCliente) {
      console.warn(`[reacciones] reacción ${msg.id} de alguien que no es el cliente de la conversación: ignorada`);
      return;
    }
    await guardarReaccion({
      organizationId,
      conversationId: fila.conversation.id,
      messageId: fila.message.id,
      actor: "cliente",
      emoji: msg.reaction?.emoji ?? "",
      userId: null,
    });
  } catch (err) {
    console.error(`[reacciones] no se pudo registrar la reacción ${msg.id}:`, err);
  }
}

/**
 * Reacción del cliente por Instagram o Messenger (evento `reaction.received`
 * de Zernio). Jamás lanza.
 */
export async function registrarReaccionZernio(
  channel: "instagram" | "messenger",
  payload: unknown
): Promise<void> {
  const evt = payload as ZernioEvent;
  try {
    const r = evt.reaction;
    if (!r || !evt.account) return;
    const found = await findZernioConnection(channel, evt.account);
    if (!found) {
      console.warn(`[reacciones] reacción de ${channel} para una cuenta que nadie conectó aquí: ignorada`);
      return;
    }
    const organizationId = found.connection.organizationId;
    const pre = channel === "messenger" ? "fb_" : "ig_";
    const candidatos = [r.messageId, r.platformMessageId]
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .flatMap((id) => [`${pre}${id}`, id]);
    const fila = await mensajePorIdPlataforma(organizationId, candidatos, channel);
    if (!fila) {
      console.log(`[reacciones] reacción de ${channel} a un mensaje que no está en el CRM (${evt.id ?? "?"}): ignorada`);
      return;
    }
    // El negocio también puede reaccionar desde la app: su id no es el del
    // cliente y se ignora (D8).
    const prefijoIdentidad = channel === "messenger" ? FB_PREFIX : IG_PREFIX;
    if (!r.sender?.id || fila.contact.waIdentity !== `${prefijoIdentidad}${r.sender.id}`) {
      console.log(`[reacciones] reacción de ${channel} que no es del cliente (${evt.id ?? "?"}): ignorada`);
      return;
    }
    await guardarReaccion({
      organizationId,
      conversationId: fila.conversation.id,
      messageId: fila.message.id,
      actor: "cliente",
      emoji: r.action === "removed" ? "" : (r.emoji ?? ""),
      userId: null,
    });
  } catch (err) {
    console.error(`[reacciones] no se pudo registrar la reacción de ${channel} ${evt?.id ?? "?"}:`, err);
  }
}

/**
 * El equipo reacciona (o quita su reacción con emoji "") desde la bandeja.
 * Primero la plataforma; si la acepta, se guarda. Devuelve las reacciones
 * del mensaje ya actualizadas.
 */
export async function reaccionar(input: {
  organizationId: string;
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
}): Promise<ReaccionDto[]> {
  const [fila] = await getDb()
    .select({ message: schema.message, conversation: schema.conversation, contact: schema.contact })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(
      scoped(
        schema.message.organizationId,
        input.organizationId,
        eq(schema.message.id, input.messageId),
        eq(schema.message.conversationId, input.conversationId)
      )
    )
    .limit(1);
  if (!fila) throw new ReaccionError("not_found", "Mensaje no encontrado");
  const { message, conversation, contact } = fila;

  // Guardrail del Laboratorio: jamás toca la API real.
  if (conversation.isTest) {
    throw new ReaccionError(
      "sandbox_violation",
      "Conversación de prueba del Laboratorio: el envío real está prohibido"
    );
  }
  if (!canalReacciona(conversation.channel)) {
    throw new ReaccionError("reaction_unavailable", "Este canal no permite reaccionar");
  }
  if (!esReaccionable(message)) {
    throw new ReaccionError("reaction_unavailable", "A este mensaje no se le puede reaccionar");
  }
  if (!replyWindow(conversation.channel, conversation.lastInboundAt).standardOpen) {
    throw new ReaccionError("window_closed", MOTIVO_VENTANA_CERRADA);
  }

  const objetivo = message.waMessageId!;
  if (conversation.channel === "whatsapp") {
    const credentials = await getCredentialsByOrg(input.organizationId);
    if (!credentials) throw new ReaccionError("not_connected", "No hay número de WhatsApp conectado");
    if (credentials.status === "reconnect_required") {
      throw new ReaccionError(
        "reconnect_required",
        "El token de WhatsApp expiró: reconecta el número en Configuración"
      );
    }
    const destinatario = destinatarioMeta(
      contact.phone ? normalizeRecipient(contact.phone) : null,
      contact.waUserId
    );
    if (!destinatario) {
      throw new ReaccionError(
        "meta_error",
        "El contacto no tiene teléfono ni identidad de WhatsApp utilizable"
      );
    }
    try {
      await callGraphSend(credentials, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...destinatario,
        type: "reaction",
        reaction: { message_id: objetivo, emoji: input.emoji },
      });
    } catch (err) {
      if (err instanceof SendError) {
        throw new ReaccionError(
          err.code === "reconnect_required" || err.code === "meta_unavailable"
            ? err.code
            : "meta_error",
          err.message
        );
      }
      throw err;
    }
  } else {
    const channel = conversation.channel as "instagram" | "messenger";
    const etiqueta = channel === "instagram" ? "Instagram" : "Messenger";
    if (!isChannelEnabled(channel)) {
      throw new ReaccionError("not_connected", `El canal de ${etiqueta} está desactivado en esta instancia`);
    }
    const creds =
      channel === "instagram"
        ? await getInstagramCredentialsByOrg(input.organizationId)
        : await getMessengerCredentialsByOrg(input.organizationId);
    if (!creds) throw new ReaccionError("not_connected", `No hay cuenta de ${etiqueta} conectada`);
    if (creds.status === "reconnect_required") {
      throw new ReaccionError(
        "reconnect_required",
        `El token de ${etiqueta} expiró: reconecta la cuenta en Configuración`
      );
    }
    if (creds.source !== "zernio") {
      throw new ReaccionError(
        "reaction_unavailable",
        `${etiqueta} conectado con app propia de Meta no permite reaccionar desde el CRM`
      );
    }
    try {
      await reactZernioMessage({
        token: creds.token,
        accountId: creds.accountRef,
        conversationId: conversation.channelThreadRef,
        messageId: idZernioDe(objetivo),
        emoji: input.emoji,
      });
    } catch (err) {
      if (err instanceof MetaApiError) {
        if (err.isAuthError) {
          if (channel === "instagram") await markInstagramReconnectRequired(input.organizationId);
          else await markMessengerReconnectRequired(input.organizationId);
          throw new ReaccionError(
            "reconnect_required",
            `El token de ${etiqueta} expiró o fue revocado: reconecta la cuenta`
          );
        }
        if (err.status === 0 || err.status >= 500) {
          throw new ReaccionError(
            "meta_unavailable",
            `${etiqueta} no está disponible en este momento; intenta de nuevo`
          );
        }
        throw new ReaccionError("meta_error", err.message);
      }
      throw err;
    }
  }

  return guardarReaccion({
    organizationId: input.organizationId,
    conversationId: conversation.id,
    messageId: message.id,
    actor: "equipo",
    emoji: input.emoji,
    userId: input.userId,
  });
}
