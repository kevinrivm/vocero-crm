import { IG_PREFIX } from "@/server/inbox/identity";
import { ingerirPartes } from "@/server/inbox/partes";
import { splitInbound, type RemoteAttachment } from "@/server/inbox/remote-media";
import {
  getInstagramCredentialsByAccountRef,
  getInstagramCredentialsByIgUserId,
} from "@/server/instagram/credentials";
import { zernioSentAtSeconds, type ZernioEvent } from "@/server/zernio";

/**
 * 014 — Adaptadores de entrada del canal de Instagram.
 *
 * Dos fuentes con formatos que no se parecen en nada: Zernio manda un evento
 * plano y Meta manda `entry[].messaging[]` al estilo Messenger. Cada una se
 * normaliza aquí y de ahí en adelante corre el MISMO núcleo de ingesta que ya
 * resuelve contacto, conversación, idempotencia y bus de eventos.
 */

/**
 * 017: la verificación de la firma vive en `server/zernio` porque la comparten
 * todos los canales que entran por esa API. Se re-exporta para no tocar a
 * quien ya la importaba de aquí.
 */
export { isValidZernioSignature } from "@/server/zernio";

export async function processZernioEvent(payload: unknown): Promise<void> {
  const evt = payload as ZernioEvent;

  // El mismo webhook trae WhatsApp, Facebook y X si esas cuentas estan
  // conectadas: sin este filtro acabariamos ingiriendo otra plataforma como
  // si fueran DMs de Instagram.
  if (evt.account?.platform !== "instagram") return;
  if (evt.event !== "message.received") return;
  if (evt.message?.direction && evt.message.direction !== "incoming") return;

  const accountRef = evt.account?.id;
  if (!accountRef) return;

  const creds = await getInstagramCredentialsByAccountRef(accountRef);
  if (!creds) {
    console.warn(
      `[ig] evento para accountId desconocido (${accountRef}): ` +
        "guarda la conexion en Configuracion -> Instagram para recibir mensajes"
    );
    return;
  }
  if (creds.source !== "zernio") {
    // Defensa en profundidad: esta instancia no habla con Zernio, asi que un
    // payload con su forma no puede ser legitimo aunque llegue por la URL
    // correcta. Sin esto, la unica barrera de la forma ajena es la URL.
    console.warn(
      `[ig] payload de Zernio en una instancia configurada como '${creds.source}': descartado`
    );
    return;
  }

  const igsid = evt.message?.sender?.id;
  if (!igsid) {
    console.warn(`[ig] evento ${evt.id ?? "?"} sin sender.id: descartado`);
    return;
  }

  const text =
    typeof evt.message?.text === "string" && evt.message.text.length > 0
      ? evt.message.text
      : null;
  // Id de Zernio, no el de la plataforma (el payload trae los dos): es el
  // que se mantiene entre reentregas, que es lo que hay que colapsar.
  const zernioMessageId = evt.message?.id;
  if (!zernioMessageId) {
    console.warn(`[ig] evento ${evt.id ?? "?"} sin id de mensaje: descartado`);
    return;
  }

  // 074: un mensaje por texto y uno por adjunto (todos, no solo el primero),
  // cada adjunto copiado a MEDIA_DIR al llegar.
  const partes = splitInbound(text, evt.message?.attachments, "zernio");
  if (partes.length === 0) return; // ni texto ni adjuntos: nada que guardar

  await ingerirPartes(
    {
      organizationId: creds.organizationId,
      identity: {
        identity: `${IG_PREFIX}${igsid}`,
        channel: "instagram",
        phone: null,
        waUserId: null,
        profileName:
          evt.message?.sender?.name ??
          (evt.message?.sender?.username
            ? `@${evt.message.sender.username}`
            : null),
      },
      timestamp: zernioSentAtSeconds(evt.message?.sentAt),
      threadRef: evt.message?.conversationId ?? null,
    },
    // Prefijado para que no colisione jamas con un id de WhatsApp en el
    // indice unico de mensajes.
    `ig_${zernioMessageId}`,
    partes
  );
}

type MetaIgPayload = {
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
        /** 074: fotos, videos, audios, publicaciones compartidas… */
        attachments?: RemoteAttachment[];
        /** 074: Meta avisa que llegó algo que no sabe entregar por la API. */
        is_unsupported?: boolean;
      };
    }>;
  }>;
};

export async function processMetaInstagramPayload(
  payload: unknown
): Promise<void> {
  const body = payload as MetaIgPayload;
  if (body.object !== "instagram") return;

  for (const entry of body.entry ?? []) {
    const igUserId = entry.id;
    if (!igUserId) continue;

    const creds = await getInstagramCredentialsByIgUserId(igUserId);
    if (!creds) {
      console.warn(
        `[ig] evento para IG_ID desconocido (${igUserId}): ` +
          "guarda la conexion en Configuracion -> Instagram para recibir mensajes"
      );
      continue;
    }
    if (creds.source !== "meta") {
      // Idem: sin app propia de Meta, un payload con su forma no puede venir
      // de Meta. Cierra la inyeccion en instancias que solo usan Zernio, donde
      // META_APP_SECRET no existe y la firma no se puede verificar.
      console.warn(
        `[ig] payload de Meta en una instancia configurada como '${creds.source}': descartado`
      );
      continue;
    }

    for (const m of entry.messaging ?? []) {
      // Los echos son mensajes que el dueno mando desde la app de Instagram.
      // Fuera del alcance del 014: se ignoran sin ruido.
      if (m.message?.is_echo) continue;

      const igsid = m.sender?.id;
      const mid = m.message?.mid;
      if (!igsid || !mid) continue;

      // 074: ya no solo texto. Un mensaje por texto y uno por adjunto, y lo
      // que Meta no entrega (`is_unsupported`) se guarda con su aviso.
      const text =
        typeof m.message?.text === "string" && m.message.text.length > 0
          ? m.message.text
          : null;
      const partes = splitInbound(
        text,
        m.message?.attachments,
        "meta",
        m.message?.is_unsupported === true
      );
      if (partes.length === 0) continue;

      await ingerirPartes(
        {
          organizationId: creds.organizationId,
          identity: {
            identity: `${IG_PREFIX}${igsid}`,
            channel: "instagram",
            phone: null,
            waUserId: null,
            // Meta no manda nombre ni usuario en el webhook: queda el respaldo
            // hasta que alguien edite el contacto.
            profileName: null,
          },
          timestamp: String(
            m.timestamp ? Math.floor(m.timestamp / 1000) : Math.floor(Date.now() / 1000)
          ),
          threadRef: null,
        },
        `ig_${mid}`,
        partes
      );
    }
  }
}
