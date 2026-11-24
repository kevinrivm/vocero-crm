import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeMx } from "@/lib/meta/client";
import { publish } from "@/server/events/bus";
import { getCredentialsByPhoneNumberId } from "@/server/whatsapp/credentials";
import { ensureAssetAvailable } from "@/server/whatsapp/media";
import type { Channel } from "@/lib/channels";
import type {
  WebhookMediaPayload,
  WebhookMessage,
  WebhookValue,
} from "@/server/inbox/webhook";
import {
  getOrCreateContactByIdentity,
  resolveIdentity,
  type ResolvedIdentity,
} from "@/server/inbox/identity";
import { applyStatusUpdate } from "@/server/inbox/status";
import {
  anuncioDeWhatsapp,
  type AnuncioDeOrigen,
} from "@/server/attribution/referral";
import { registrarAnuncioDeOrigen } from "@/server/attribution/store";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { despachoActivo } from "@/server/brains/config";
import { despacharAlCerebro } from "@/server/dispatch/encolar";
import { pausarIaPorRespuestaManual } from "@/server/inbox/pausa-manual";
import { registrarReaccionWhatsApp } from "@/server/inbox/reacciones";
import { esReaccionable, type ReaccionDto } from "@/lib/reacciones";
import { registrarEdicionWhatsApp } from "@/server/inbox/ediciones";
import { payloadPublico, type RemoteMedia } from "@/server/inbox/remote-media";
import {
  aCitaDto,
  citaDelWebhook,
  resolverCita,
  type CitaEncontrada,
} from "@/server/inbox/quotes";

/**
 * Tipos que la bandeja sabe dibujar y el cerebro sabe leer. 074: el resto ya
 * no se descarta (ver `tipoDeEntrante`).
 */
const SUPPORTED_TYPES = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
]);

/** #78 — Respuestas de botón: entran como texto (ver `contenidoEntrante`). */
const BUTTON_REPLY_TYPES = new Set(["button", "interactive"]);

/**
 * 074 — Lo único que se ignora: eventos que no son un mensaje para el hilo
 * (avisos del sistema, el saludo de bienvenida, borrados, temporales).
 */
const IGNORED_TYPES = new Set(["system", "request_welcome", "revoke", "ephemeral"]);

/**
 * 074 — Qué hacer con un mensaje del webhook de WhatsApp según su tipo.
 *
 * - `normal`: se guarda y despierta al cerebro, como siempre.
 * - `sin_vista`: llegó, pero ni la bandeja lo sabe dibujar ni el cerebro leer
 *   (`unsupported`, encuestas, pedidos del catálogo…). Se guarda SIN su
 *   contenido —puede traer datos que nadie pidió guardar— para que el equipo
 *   sepa que llegó y lo abra en el teléfono. No despierta al cerebro.
 * - `edicion`: cambia un mensaje que ya existe (`ediciones.ts`).
 * - `reaccion`: tampoco es un mensaje; tiene su propio camino.
 * - `ignorar`: no es un mensaje.
 */
export function tipoDeEntrante(
  type: string
): "normal" | "sin_vista" | "edicion" | "reaccion" | "ignorar" {
  if (SUPPORTED_TYPES.has(type) || BUTTON_REPLY_TYPES.has(type)) return "normal";
  if (type === "edit") return "edicion";
  if (type === "reaction") return "reaccion";
  if (IGNORED_TYPES.has(type)) return "ignorar";
  return "sin_vista";
}

/**
 * #78 — Lo que escribió el cliente, también cuando lo hizo tocando un botón.
 *
 * Cuando el cliente toca un botón de respuesta rápida de una plantilla, Meta
 * manda `type: "button"` con el rótulo en `button.text`; cuando toca un botón
 * o una fila de lista de un mensaje interactivo, `type: "interactive"` con el
 * rótulo en `interactive.button_reply.title` o `interactive.list_reply.title`.
 * Para el negocio eso es un texto del cliente: entra a la bandeja, abre la
 * ventana de 24 h y dispara al agente igual que si lo hubiera tecleado. Se
 * guarda como `text` con el rótulo; el `payload`/`id` del botón no, porque el
 * mensaje no tiene campo para metadatos y el rótulo es lo que el cliente vio y
 * eligió. Devuelve null si la respuesta no trae ni rótulo ni identificador
 * (payload roto): quien llama la descarta con aviso, nunca revienta el webhook.
 */
export function contenidoEntrante(
  msg: WebhookMessage
): { type: string; text: string | null } | null {
  if (msg.type === "button") {
    const rotulo = limpio(msg.button?.text) ?? limpio(msg.button?.payload);
    return rotulo ? { type: "text", text: rotulo } : null;
  }
  if (msg.type === "interactive") {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    const rotulo = limpio(reply?.title) ?? limpio(reply?.id);
    return rotulo ? { type: "text", text: rotulo } : null;
  }
  return { type: msg.type, text: msg.text?.body ?? null };
}

function limpio(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** Tipos con archivo binario en Graph (008). */
const BINARY_MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
  "sticker",
] as const);

export type MediaInput = {
  kind: (typeof schema.mediaAsset.$inferSelect)["kind"];
  waMediaId: string | null;
  mimeType: string | null;
  fileName: string | null;
  caption: string | null;
  payload: unknown;
  fetchStatus: "available" | "pending";
};

/**
 * 074 — El adjunto de Instagram, Messenger o TikTok: sin id de Graph, con la
 * URL firmada y su origen en el payload. Se baja en segundo plano al llegar.
 */
export function mediaRemota(m: RemoteMedia): MediaInput {
  return {
    kind: m.kind,
    waMediaId: null,
    mimeType: null,
    fileName: null,
    caption: null,
    payload: { sourceUrl: m.sourceUrl, origen: m.origen },
    fetchStatus: "pending",
  };
}

/**
 * 008 — Extrae el adjunto de un mensaje del webhook (entrante o echo).
 * Tolerante: payload incompleto → null (el mensaje se conserva sin adjunto).
 */
export function mediaInputFrom(msg: WebhookMessage): MediaInput | null {
  if (msg.type === "location" && msg.location) {
    const { latitude, longitude } = msg.location;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return null;
    }
    return {
      kind: "location",
      waMediaId: null,
      mimeType: null,
      fileName: null,
      caption: null,
      payload: msg.location,
      fetchStatus: "available",
    };
  }
  if (msg.type === "contacts" && Array.isArray(msg.contacts) && msg.contacts.length) {
    return {
      kind: "contacts",
      waMediaId: null,
      mimeType: null,
      fileName: null,
      caption: null,
      payload: msg.contacts,
      fetchStatus: "available",
    };
  }
  if ((BINARY_MEDIA_TYPES as Set<string>).has(msg.type)) {
    const media = msg[msg.type as "image" | "video" | "audio" | "document" | "sticker"] as
      | WebhookMediaPayload
      | undefined;
    if (!media?.id) return null;
    return {
      kind: msg.type as MediaInput["kind"],
      waMediaId: media.id,
      mimeType: media.mime_type ?? null,
      fileName: media.filename ?? null,
      caption: media.caption ?? null,
      payload: null,
      fetchStatus: "pending",
    };
  }
  return null;
}

/**
 * Crea el media_asset de un mensaje recién insertado y dispara la descarga en
 * segundo plano si hay binario. Jamás lanza hacia el webhook (FR-013).
 */
async function attachMediaAsset(
  organizationId: string,
  messageId: string,
  media: MediaInput
): Promise<typeof schema.mediaAsset.$inferSelect | null> {
  try {
    const db = getDb();
    const inserted = await db
      .insert(schema.mediaAsset)
      .values({
        id: newId("mediaAsset"),
        organizationId,
        kind: media.kind,
        waMediaId: media.waMediaId,
        mimeType: media.mimeType,
        fileName: media.fileName,
        caption: media.caption,
        payload: media.payload ?? null,
        fetchStatus: media.fetchStatus,
      })
      .returning();
    const asset = inserted[0];
    if (!asset) return null;
    await db
      .update(schema.message)
      .set({ mediaAssetId: asset.id })
      .where(eq(schema.message.id, messageId));
    if (asset.fetchStatus === "pending") {
      // Descarga in-process, sin bloquear la ingesta; on-demand reintenta.
      // 044: al terminar se avisa a la bandeja, que pintó «descargando…».
      void ensureAssetAvailable(organizationId, asset.id)
        .then(() => avisarAdjuntoListo(organizationId, messageId, asset.id))
        .catch(() => {});
    }
    return asset;
  } catch (err) {
    console.warn(`[media] no se pudo registrar el adjunto de ${messageId}:`, err);
    return null;
  }
}

/**
 * Alta/resolución de contacto por teléfono (alta manual / seeds). La ingesta
 * del webhook usa `getOrCreateContactByIdentity` (003) — este helper deriva la
 * identidad del teléfono normalizado y delega ahí.
 */
export async function getOrCreateContact(
  organizationId: string,
  phone: string,
  name?: string | null
) {
  const normalized = normalizeMx(phone);
  return getOrCreateContactByIdentity(organizationId, {
    identity: normalized,
    phone: normalized,
    waUserId: null,
    profileName: name ?? null,
  });
}

export async function getOrCreateConversation(
  organizationId: string,
  contactId: string,
  opts?: { channel?: Channel; threadRef?: string | null }
) {
  const db = getDb();
  const inserted = await db
    .insert(schema.conversation)
    .values({
      id: newId("conversation"),
      organizationId,
      contactId,
      channel: opts?.channel ?? "whatsapp",
      channelThreadRef: opts?.threadRef ?? null,
      // 027: hereda la pausa del contacto en el mismo INSERT. Si se leyera
      // antes, cada mensaje entrante pagaría una consulta más, y entre la
      // lectura y la inserción cabría el primer turno del agente.
      aiEnabled: sql<boolean>`coalesce((select not c.ai_paused from contact c where c.id = ${contactId}), true)`,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const rows = await db
    .select()
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.contactId, contactId),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("conversación no encontrada tras upsert");
  // 014: el hilo de la plataforma puede aparecer despues (o cambiar); se
  // guarda en cuanto se conoce para poder responder.
  if (opts?.threadRef && existing.channelThreadRef !== opts.threadRef) {
    await db
      .update(schema.conversation)
      .set({ channelThreadRef: opts.threadRef, updatedAt: new Date() })
      .where(eq(schema.conversation.id, existing.id));
    existing.channelThreadRef = opts.threadRef;
  }
  return existing;
}

/**
 * Procesa el `value` de un cambio `messages` del webhook: mensajes entrantes
 * (idempotentes por wa_message_id) y actualizaciones de estado.
 */
export async function processMessagesValue(value: WebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) {
    // Caso típico: webhook/override configurado ANTES de guardar la conexión
    // en el wizard — el evento llega pero no hay a qué organización enrutarlo.
    console.warn(
      `[webhook] evento para phone_number_id desconocido (${phoneNumberId}): ` +
        "guarda la conexión en Configuración → WhatsApp para recibir mensajes"
    );
    return;
  }

  const organizationId = credentials.organizationId;

  for (const status of value.statuses ?? []) {
    await applyStatusUpdate(organizationId, status);
  }

  for (const msg of value.messages ?? []) {
    const clase = tipoDeEntrante(msg.type);
    // 072: la reacción no es un mensaje nuevo: se pega al que reacciona. No
    // abre la ventana ni despierta al cerebro.
    if (clase === "reaccion") {
      await registrarReaccionWhatsApp(organizationId, msg, value.contacts);
      continue;
    }
    if (clase === "ignorar") continue;
    if (clase === "edicion") {
      await registrarEdicionWhatsApp(organizationId, msg, {
        tipo: "cliente",
        contacts: value.contacts,
      });
      continue;
    }
    if (clase === "sin_vista") {
      const quien = resolveIdentity(msg, value.contacts);
      if (!quien) {
        console.warn(`[webhook] mensaje ${msg.id} sin identidad utilizable: descartado`);
        continue;
      }
      // Solo el tipo al log: el contenido puede traer datos del cliente.
      console.log(`[webhook] mensaje ${msg.id} de tipo «${msg.type}»: se guarda sin vista propia`);
      await ingestInboundMessage({
        organizationId,
        identity: quien,
        waMessageId: msg.id,
        type: msg.type,
        text: null,
        timestamp: msg.timestamp,
        media: null,
        replyToWaMessageId: citaDelWebhook(msg),
        anuncio: anuncioDeWhatsapp(msg.referral),
        despertar: false,
      });
      continue;
    }
    const contenido = contenidoEntrante(msg);
    if (!contenido) {
      console.warn(
        `[webhook] respuesta de botón ${msg.id} (${msg.type}) sin rótulo ni identificador: descartada`
      );
      continue;
    }
    const resolved = resolveIdentity(msg, value.contacts);
    if (!resolved) {
      // Mensaje sin NINGUNA identidad utilizable (ni teléfono ni BSUID):
      // registrar y descartar — jamás reventar el webhook (003).
      console.warn(
        `[webhook] mensaje ${msg.id} sin identidad utilizable (sin from ni from_user_id): descartado`
      );
      continue;
    }
    await ingestInboundMessage({
      organizationId,
      identity: resolved,
      waMessageId: msg.id,
      type: contenido.type,
      text: contenido.text,
      timestamp: msg.timestamp,
      media: mediaInputFrom(msg),
      replyToWaMessageId: citaDelWebhook(msg),
      // 018: normalizado aquí, en el adaptador del canal; la ingesta no sabe
      // de qué forma lo mandó Meta.
      anuncio: anuncioDeWhatsapp(msg.referral),
    });
  }
}

/**
 * 008 — Echoes de coexistence (`smb_message_echoes`): mensajes que el dueño
 * envió A MANO desde la app de WhatsApp Business del teléfono. Se registran
 * como salientes `origin='manual'` y pausan la IA (decisión del dueño
 * 2026-08-04). JAMÁS tocan la ventana de 24 h ni disparan al agente.
 */
export async function processEchoesValue(value: WebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) {
    console.warn(
      `[webhook] echo para phone_number_id desconocido (${phoneNumberId}): descartado`
    );
    return;
  }

  // Meta documenta `message_echoes`; parser tolerante a `messages` (R1).
  const echoes = value.message_echoes ?? value.messages ?? [];
  for (const echo of echoes) {
    const clase = tipoDeEntrante(echo.type);
    // 074: alguien del negocio editó desde el teléfono un mensaje suyo.
    if (clase === "edicion") {
      await registrarEdicionWhatsApp(credentials.organizationId, echo, { tipo: "negocio" });
      continue;
    }
    if (clase !== "normal" && clase !== "sin_vista") continue;
    if (!echo.to) {
      console.warn(`[webhook] echo ${echo.id} sin destinatario: descartado`);
      continue;
    }
    try {
      await ingestManualEcho(credentials.organizationId, echo);
    } catch (err) {
      // Un echo malformado jamás tumba el webhook (edge case del spec).
      console.error(`[webhook] error procesando echo ${echo.id}:`, err);
    }
  }
}

async function ingestManualEcho(
  organizationId: string,
  echo: WebhookMessage
): Promise<void> {
  const db = getDb();
  const identity = normalizeMx(echo.to!);

  const { contact } = await getOrCreateContactByIdentity(organizationId, {
    identity,
    phone: identity,
    waUserId: null,
    profileName: null,
  });
  const conversation = await getOrCreateConversation(organizationId, contact.id);

  const waTimestamp = toDate(echo.timestamp);
  // 074: una tarjeta o encuesta que el negocio mandó desde el teléfono se
  // guarda sin su contenido, como la del cliente.
  const sinVista = tipoDeEntrante(echo.type) === "sin_vista";

  // Idempotencia dura: los mensajes ya registrados (o echoes repetidos) no
  // duplican efectos — mismo wa_message_id → sin inserción ni handoff extra.
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId,
      conversationId: conversation.id,
      waMessageId: echo.id,
      direction: "out",
      type: echo.type,
      text: sinVista ? null : (echo.text?.body ?? null),
      status: "sent",
      origin: "manual",
      // 039: el dueño también cita desde el teléfono.
      replyToWaMessageId: citaDelWebhook(echo),
      waTimestamp,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  const message = inserted[0];
  if (!message) return; // duplicado

  const mediaInput = sinVista ? null : mediaInputFrom(echo);
  const asset = mediaInput
    ? await attachMediaAsset(organizationId, message.id, mediaInput)
    : null;

  // Solo lastMessageAt: un mensaje del negocio NUNCA abre la ventana de 24 h.
  await db
    .update(schema.conversation)
    .set({ lastMessageAt: waTimestamp, updatedAt: new Date() })
    .where(eq(schema.conversation.id, conversation.id));

  // Pausa automática de la IA, idempotente y atómica (solo si no hay handoff).
  // 068: la misma que usa la Bandeja (`pausa-manual.ts`).
  await pausarIaPorRespuestaManual(organizationId, conversation.id);

  publish(organizationId, {
    type: "message.new",
    data: {
      conversationId: conversation.id,
      message: serializeMessage(
        message,
        asset,
        await resolverCita(organizationId, message)
      ),
    },
  });
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });
}

export async function ingestInboundMessage(input: {
  organizationId: string;
  identity: ResolvedIdentity;
  waMessageId: string;
  type: string;
  text: string | null;
  timestamp: string;
  media?: MediaInput | null;
  /** 039: `wamid` del mensaje que el cliente citó, si citó alguno. */
  replyToWaMessageId?: string | null;
  /** 014: hilo en la plataforma de origen (Zernio); null en WhatsApp. */
  threadRef?: string | null;
  /** 016/018: el anuncio que abrió la conversación, ya normalizado por el canal. */
  anuncio?: AnuncioDeOrigen | null;
  /**
   * 074 — `false` guarda el mensaje sin despertar al cerebro: lo usan las
   * partes de un grupo de adjuntos que no son la última (nueve fotos juntas
   * son UN turno, con las nueve en la ráfaga) y lo que el cerebro no sabe
   * leer. Por defecto, true.
   */
  despertar?: boolean;
}): Promise<void> {
  const db = getDb();
  const { organizationId } = input;

  const { contact } = await getOrCreateContactByIdentity(
    organizationId,
    input.identity
  );
  const conversation = await getOrCreateConversation(
    organizationId,
    contact.id,
    { channel: contact.channel, threadRef: input.threadRef ?? null }
  );

  // 016/018 — Si el mensaje viene de un anuncio, capturar su origen ANTES del
  // dedup de mensaje: es idempotente por sí mismo (el primer anuncio gana) y
  // así un reintento de Meta que llegue con el referral no lo pierde por
  // haberse cortado antes en el dedup. Siempre, desde 018: la bandeja dice de
  // qué anuncio llegó cada quien; sin la bandera ATRIBUCION se guarda sin el
  // identificador de clic (lo decide `registrarAnuncioDeOrigen`). Si falla,
  // el mensaje del cliente entra igual: el anuncio es contexto, el mensaje es
  // lo que importa.
  if (input.anuncio) {
    try {
      await registrarAnuncioDeOrigen({
        organizationId,
        contactId: contact.id,
        conversationId: conversation.id,
        anuncio: input.anuncio,
      });
    } catch (err) {
      console.warn(
        `[atribucion] no se registró el anuncio de ${conversation.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const waTimestamp = toDate(input.timestamp);

  // Idempotencia dura: mismo wa_message_id → sin efectos adicionales.
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId,
      conversationId: conversation.id,
      waMessageId: input.waMessageId,
      direction: "in",
      type: input.type,
      text: input.text,
      status: "delivered",
      replyToWaMessageId: input.replyToWaMessageId ?? null,
      waTimestamp,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  const message = inserted[0];
  if (!message) return; // duplicado

  const asset = input.media
    ? await attachMediaAsset(organizationId, message.id, input.media)
    : null;

  await db
    .update(schema.conversation)
    .set({
      lastInboundAt: waTimestamp,
      lastMessageAt: waTimestamp,
      unreadCount: sql`${schema.conversation.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.conversation.id, conversation.id));

  await onLeadActivity(organizationId, contact.id, waTimestamp);

  publish(organizationId, {
    type: "message.new",
    data: {
      conversationId: conversation.id,
      message: serializeMessage(
        message,
        asset,
        await resolverCita(organizationId, message)
      ),
    },
  });
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });

  // 074: las partes de un grupo que no son la última, y lo que el cerebro no
  // sabe leer, se quedan en la bandeja sin abrir un turno.
  if (input.despertar === false) return;

  // 036 — Quien contesta es el cerebro conectado; sin él, una persona. El
  // 025: `message.id` es lo que el despacho le debe al cerebro.
  if (despachoActivo()) await despacharAlCerebro(conversation.id, organizationId, message.id);
}

function toDate(timestamp: string): Date {
  const n = Number(timestamp);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000);
  return new Date();
}

/**
 * 044 — Publica el estado final del adjunto (disponible o fallido) para que la
 * burbuja deje de decir «descargando…» sin recargar.
 */
async function avisarAdjuntoListo(
  organizationId: string,
  messageId: string,
  assetId: string
): Promise<void> {
  const db = getDb();
  const [fila] = await db
    .select({ message: schema.message, asset: schema.mediaAsset })
    .from(schema.message)
    .innerJoin(schema.mediaAsset, eq(schema.mediaAsset.id, assetId))
    .where(scoped(schema.message.organizationId, organizationId, eq(schema.message.id, messageId)))
    .limit(1);
  if (!fila || fila.asset.fetchStatus === "pending") return;
  publish(organizationId, {
    type: "message.media",
    data: {
      conversationId: fila.message.conversationId,
      messageId,
      media: serializeMessage(fila.message, fila.asset).media,
    },
  });
}

export function serializeMessage(
  m: typeof schema.message.$inferSelect,
  media: typeof schema.mediaAsset.$inferSelect | null = null,
  /** 039: el mensaje citado ya resuelto (`resolverCitas`); null si no está. */
  cita: CitaEncontrada | null = null,
  /** 072: sus reacciones (`reaccionesDe`); un mensaje nuevo no tiene. */
  reactions: ReaccionDto[] = []
) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    type: m.type,
    text: m.text,
    status: m.status,
    /** Motivo del fallo, ya traducido a algo accionable (`describeSendError`). */
    error: m.error,
    aiGenerated: m.aiGenerated,
    origin: m.origin,
    media: media
      ? {
          assetId: media.id,
          kind: media.kind,
          mimeType: media.mimeType,
          fileName: media.fileName,
          fileSize: media.fileSize,
          caption: media.caption,
          fetchStatus: media.fetchStatus,
          // 074: sin la URL firmada de origen de los canales sociales.
          payload: payloadPublico(media.payload),
        }
      : null,
    /** 039: se le puede responder citando (tiene id en la plataforma). */
    quotable: Boolean(m.waMessageId),
    replyTo: m.replyToWaMessageId ? aCitaDto(cita) : null,
    /** 072: tiene id en la plataforma con el que se puede reaccionar. */
    reactable: esReaccionable(m),
    reactions,
    /** 074: hora de la última edición, o null si nunca se editó. */
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    /** 074: lo que decía antes de la primera edición. */
    originalText: m.editedAt ? m.originalText : null,
    createdAt: (m.waTimestamp ?? m.createdAt).toISOString(),
  };
}
