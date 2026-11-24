import { TT_PREFIX } from "@/server/inbox/identity";
import { ingerirPartes } from "@/server/inbox/partes";
import { splitInbound, type RemoteAttachment } from "@/server/inbox/remote-media";
import { getTiktokCredentialsByAccountRef } from "@/server/tiktok/credentials";
import { zernioSentAtSeconds, type ZernioEvent } from "@/server/zernio";

/**
 * 022 — Entrada del canal de TikTok.
 *
 * Una sola fuente (Zernio), un evento plano con `account`. Se normaliza aquí
 * y de ahí en adelante corre el MISMO núcleo de ingesta que los demás canales:
 * contacto, conversación, idempotencia, bus de eventos y turno del agente.
 *
 * El normalizador es una función pura para poder probarlo sin base de datos:
 * qué se ingiere y qué se descarta es la parte que más fácil se rompe cuando
 * el proveedor cambia un campo.
 */

/** Un mensaje entrante ya en la forma que entiende el núcleo. */
export type TiktokInbound = {
  /** `account.id` de Zernio: la llave de enrutado a la organización. */
  accountRef: string;
  /** Id del remitente: la identidad del contacto (`tt:<id>`). */
  senderId: string;
  /** Id del mensaje en Zernio, para deduplicar. */
  messageId: string;
  text: string | null;
  /** text | image | video | audio | document | sticker | unsupported */
  type: string;
  /** Segundos desde epoch, como lo consume el núcleo. */
  timestamp: string;
  profileName: string | null;
  /** `conversationId` opaco de Zernio: hace falta para responder. */
  threadRef: string | null;
  /**
   * 074 — Todos los adjuntos, con su URL temporal. `type` resume el evento;
   * al guardarlo, cada adjunto entra como su propio mensaje (`splitInbound`).
   */
  attachments: RemoteAttachment[];
};

/**
 * Tipos de adjunto → tipo que resume el evento. 074: al guardarlo, cada
 * adjunto entra además como su propio mensaje y se copia de la URL temporal
 * que manda Zernio.
 */
const ATTACHMENT_TYPE: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
  sticker: "sticker",
};

/** La plataforma del evento: Zernio la manda en la cuenta y en el mensaje. */
export function zernioPlatform(evt: ZernioEvent | null): string {
  return (evt?.account?.platform ?? evt?.message?.platform ?? "").toLowerCase();
}

/**
 * Evento de Zernio → mensaje de TikTok, o nada. El MISMO webhook trae las
 * demás plataformas conectadas a esa llave: sin el filtro acabaríamos
 * ingiriendo un DM de Instagram como si fuera de TikTok.
 */
export function normalizeZernioTiktokEvent(payload: unknown): TiktokInbound[] {
  const evt = payload as ZernioEvent | null;
  if (!evt || typeof evt !== "object") return [];

  if (zernioPlatform(evt) !== "tiktok") return [];
  if (evt.event !== "message.received") return [];
  // `message.sent` no llega aquí, pero un evento marcado saliente tampoco es
  // algo que el cliente dijo.
  if (evt.message?.direction && evt.message.direction !== "incoming") return [];

  const accountRef = evt.account?.id ?? evt.account?.accountId;
  const senderId = evt.message?.sender?.id;
  const messageId = evt.message?.id;
  if (!accountRef || !senderId || !messageId) return [];

  const text =
    typeof evt.message?.text === "string" && evt.message.text.length > 0
      ? evt.message.text
      : null;
  const adjunto = evt.message?.attachments?.[0];
  const type = text
    ? "text"
    : adjunto
      ? (ATTACHMENT_TYPE[adjunto.type ?? ""] ?? "unsupported")
      : null;
  if (!type) return []; // ni texto ni adjunto: no hay nada que ingerir

  const sender = evt.message?.sender;
  return [
    {
      accountRef,
      senderId,
      messageId,
      text,
      type,
      timestamp: zernioSentAtSeconds(evt.message?.sentAt),
      profileName:
        sender?.name?.trim() ||
        (sender?.username ? `@${sender.username.replace(/^@/, "")}` : null),
      // Opaco por contrato: se guarda tal cual y no se parsea.
      threadRef: evt.message?.conversationId ?? evt.conversation?.id ?? null,
      attachments: Array.isArray(evt.message?.attachments) ? evt.message.attachments : [],
    },
  ];
}

export async function processZernioTiktokEvent(payload: unknown): Promise<void> {
  for (const evt of normalizeZernioTiktokEvent(payload)) {
    const creds = await getTiktokCredentialsByAccountRef(evt.accountRef);
    if (!creds) {
      console.warn(
        `[tiktok] evento para una cuenta desconocida (${evt.accountRef}): ` +
          "guarda la conexión en Configuración → TikTok para recibir mensajes"
      );
      continue;
    }

    // 074: un mensaje por texto y uno por adjunto, cada uno copiado a
    // MEDIA_DIR al llegar. Solo el último despierta al cerebro.
    const partes = splitInbound(evt.text, evt.attachments, "zernio");
    if (partes.length === 0) continue;

    await ingerirPartes(
      {
        organizationId: creds.organizationId,
        identity: {
          identity: `${TT_PREFIX}${evt.senderId}`,
          channel: "tiktok",
          phone: null,
          waUserId: null,
          profileName: evt.profileName,
        },
        timestamp: evt.timestamp,
        threadRef: evt.threadRef,
      },
      // Prefijado para que no colisione jamás con un id de otro canal en el
      // índice único de mensajes.
      `tt_${evt.messageId}`,
      partes
    );
  }
}
