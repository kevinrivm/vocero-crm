import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { FB_PREFIX } from "@/server/inbox/identity";
import { ingerirPartes } from "@/server/inbox/partes";
import {
  splitInbound,
  type OrigenRemoto,
  type RemoteAttachment,
} from "@/server/inbox/remote-media";
import {
  getMessengerCredentialsByAccountRef,
  getMessengerCredentialsByPageId,
} from "@/server/messenger/credentials";
import { fetchMessengerProfileName } from "@/server/messenger/send";
import { zernioSentAtSeconds, type ZernioEvent } from "@/server/zernio";

/**
 * 017 — Adaptadores de entrada del canal de Messenger.
 *
 * Dos fuentes con formatos que no se parecen: Meta manda los mensajes de la
 * página con `object: "page"` y la forma `entry[].messaging[]`; Zernio manda un
 * evento plano con `account`. Cada una se normaliza aquí y de ahí en adelante
 * corre el MISMO núcleo de ingesta que ya resuelve contacto, conversación,
 * idempotencia y bus de eventos (SSE).
 *
 * Los normalizadores son funciones puras para poder probarlos sin base de
 * datos: qué se ingiere y qué se descarta (echos, acuses, postbacks, otra
 * plataforma) es la parte que más fácil se rompe cuando el proveedor cambia un
 * campo.
 */

/** Un mensaje entrante ya en la forma que entiende el núcleo. */
export type MessengerInbound = {
  /** Llave de enrutado: la página (Meta) o la cuenta de Zernio. */
  routeKey: string;
  /** Page-Scoped ID del remitente: la identidad del contacto (`fb:<PSID>`). */
  psid: string;
  /** Id del mensaje en la plataforma, para deduplicar. */
  messageId: string;
  text: string | null;
  /** Tipo para la bandeja: text | image | video | audio | document | sticker | unsupported */
  type: string;
  /** Segundos desde epoch, como lo consume el núcleo. */
  timestamp: string;
  /** Nombre del perfil si la fuente lo entrega (Zernio sí, Meta no). */
  profileName: string | null;
  /** Hilo en la plataforma de origen: hace falta para responder por Zernio. */
  threadRef: string | null;
  /**
   * 074 — Todos los adjuntos, con su URL firmada. `type` resume el evento;
   * al guardarlo, cada adjunto entra como su propio mensaje (`splitInbound`).
   */
  attachments: RemoteAttachment[];
};

type MetaPagePayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        is_echo?: boolean;
        attachments?: RemoteAttachment[];
      };
      postback?: unknown;
      delivery?: unknown;
      read?: unknown;
    }>;
  }>;
};

/**
 * Tipos de adjunto → tipo que resume el evento. 074: al guardarlo, cada
 * adjunto entra además como su propio mensaje y se copia de la URL temporal
 * que mandan las dos fuentes (`splitInbound` y `ensureAssetAvailable`).
 */
const ATTACHMENT_TYPE: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
  document: "document",
};

/** Plataformas con las que Zernio nombra a Messenger. */
const ZERNIO_MESSENGER_PLATFORMS = new Set(["facebook", "messenger"]);

export function normalizeMetaPagePayload(payload: unknown): MessengerInbound[] {
  const body = payload as MetaPagePayload | null;
  if (!body || body.object !== "page") return [];

  const out: MessengerInbound[] = [];
  for (const entry of body.entry ?? []) {
    const pageId = entry.id;
    if (!pageId) continue;

    for (const m of entry.messaging ?? []) {
      const msg = m.message;
      // Acuses de entrega/lectura y postbacks no son mensajes: nada que
      // enseñar en la bandeja.
      if (!msg) continue;
      // Los echos son lo que la página mandó desde su propia bandeja de
      // Facebook. Fuera del alcance de la v1: se ignoran sin ruido.
      if (msg.is_echo) continue;

      const psid = m.sender?.id;
      const mid = msg.mid;
      if (!psid || !mid) continue;

      const text =
        typeof msg.text === "string" && msg.text.length > 0 ? msg.text : null;
      const type = resolveType(text, msg.attachments?.[0]);
      if (!type) continue; // ni texto ni adjunto: no hay nada que ingerir

      out.push({
        routeKey: pageId,
        psid,
        messageId: mid,
        text,
        type,
        timestamp: String(
          m.timestamp ? Math.floor(m.timestamp / 1000) : Math.floor(Date.now() / 1000)
        ),
        // Meta no manda nombre ni usuario en el webhook: se consulta aparte.
        profileName: null,
        threadRef: null,
        attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
      });
    }
  }
  return out;
}

/**
 * Evento de Zernio. El MISMO webhook trae Instagram, WhatsApp y X si esas
 * cuentas están conectadas: sin el filtro de plataforma acabaríamos ingiriendo
 * otro canal como si fueran mensajes de la página.
 */
export function normalizeZernioEvent(payload: unknown): MessengerInbound[] {
  const evt = payload as ZernioEvent | null;
  if (!evt || typeof evt !== "object") return [];

  const platform = (evt.account?.platform ?? "").toLowerCase();
  if (!ZERNIO_MESSENGER_PLATFORMS.has(platform)) return [];
  if (evt.event !== "message.received") return [];
  if (evt.message?.direction && evt.message.direction !== "incoming") return [];

  const accountRef = evt.account?.id;
  const psid = evt.message?.sender?.id;
  const messageId = evt.message?.id;
  if (!accountRef || !psid || !messageId) return [];

  const text =
    typeof evt.message?.text === "string" && evt.message.text.length > 0
      ? evt.message.text
      : null;
  const type = resolveType(text, evt.message?.attachments?.[0]);
  if (!type) return [];

  const sender = evt.message?.sender;
  return [
    {
      routeKey: accountRef,
      psid,
      messageId,
      text,
      type,
      timestamp: zernioSentAtSeconds(evt.message?.sentAt),
      profileName:
        sender?.name?.trim() ||
        (sender?.username ? `@${sender.username}` : null),
      // Opaco por contrato: se guarda tal cual y no se parsea. Es lo que hace
      // falta para responder por Zernio.
      threadRef: evt.message?.conversationId ?? null,
      attachments: Array.isArray(evt.message?.attachments) ? evt.message.attachments : [],
    },
  ];
}

function resolveType(
  text: string | null,
  attachment: RemoteAttachment | undefined
): string | null {
  if (text) return "text";
  if (!attachment) return null;
  if (attachment.payload?.sticker_id) return "sticker";
  return ATTACHMENT_TYPE[attachment.type ?? ""] ?? "unsupported";
}

async function contactExists(
  organizationId: string,
  identity: string
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, organizationId),
        eq(schema.contact.channel, "messenger"),
        eq(schema.contact.waIdentity, identity)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function processMetaPagePayload(payload: unknown): Promise<void> {
  await ingestAll(normalizeMetaPagePayload(payload), "meta");
}

export async function processZernioMessengerEvent(
  payload: unknown
): Promise<void> {
  await ingestAll(normalizeZernioEvent(payload), "zernio");
}

async function ingestAll(
  events: MessengerInbound[],
  source: "zernio" | "meta"
): Promise<void> {
  for (const evt of events) {
    const creds =
      source === "meta"
        ? await getMessengerCredentialsByPageId(evt.routeKey)
        : await getMessengerCredentialsByAccountRef(evt.routeKey);

    if (!creds) {
      console.warn(
        `[messenger] evento para una cuenta desconocida (${evt.routeKey}): ` +
          "guarda la conexión en Configuración → Messenger para recibir mensajes"
      );
      continue;
    }
    if (creds.source !== source) {
      // Defensa en profundidad: si esta instancia no habla con esa fuente, un
      // payload con su forma no puede ser legítimo aunque llegue por la URL
      // correcta. Sin esto, la única barrera de la forma ajena es la URL.
      console.warn(
        `[messenger] payload de ${source} en una instancia configurada como ` +
          `'${creds.source}': descartado`
      );
      continue;
    }

    const identity = `${FB_PREFIX}${evt.psid}`;
    // El nombre se resuelve UNA vez, la primera que se ve al PSID: después el
    // contacto ya existe y el nombre que tenga (o el que editó el operador)
    // manda. Consultarlo en cada mensaje sería un viaje al proveedor por
    // renglón.
    const profileName =
      evt.profileName ??
      ((await contactExists(creds.organizationId, identity))
        ? null
        : await fetchMessengerProfileName(creds, evt.psid));

    // 074: un mensaje por texto y uno por adjunto (todos, no solo el
    // primero). Solo el último despierta al cerebro.
    const origen: OrigenRemoto = source;
    const partes = splitInbound(evt.text, evt.attachments, origen);
    if (partes.length === 0) continue;

    await ingerirPartes(
      {
        organizationId: creds.organizationId,
        identity: {
          identity,
          channel: "messenger",
          phone: null,
          waUserId: null,
          profileName,
        },
        timestamp: evt.timestamp,
        threadRef: evt.threadRef,
      },
      // Prefijado para que no colisione jamás con un id de WhatsApp ni de
      // Instagram en el índice único de mensajes.
      `fb_${evt.messageId}`,
      partes
    );
  }
}
