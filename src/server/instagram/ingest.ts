import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import {
  getOrCreateContactByIdentity,
  IG_PREFIX,
} from "@/server/inbox/identity";
import {
  attachMediaAsset,
  getOrCreateConversation,
  ingestInboundMessage,
  serializeMessage,
  type MediaInput,
} from "@/server/inbox/ingest";
import {
  getInstagramCredentialsByAccountRef,
  getInstagramCredentialsByIgUserId,
} from "@/server/instagram/credentials";
import {
  parseZernioEvent,
  zernioSentAtSeconds,
  type ZernioEvent,
} from "@/server/zernio";

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

/**
 * Evento de Zernio. Devuelve el secreto esperado para poder validar la firma
 * ANTES de procesar: el enrutado por `account.id` necesita leer el cuerpo, así
 * que la validación ocurre en dos tiempos (resolver cuenta, luego firmar).
 */
export async function resolveZernioSecret(
  rawBody: string
): Promise<{ secret: string | null; accountRef: string | null }> {
  const parsed: ZernioEvent | null = parseZernioEvent(rawBody);
  if (!parsed) return { secret: null, accountRef: null };
  const accountRef = parsed.account?.id ?? null;
  if (!accountRef) return { secret: null, accountRef: null };
  const creds = await getInstagramCredentialsByAccountRef(accountRef);
  return { secret: creds?.webhookSecret ?? null, accountRef };
}

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

  const text = evt.message?.text ?? null;
  // Id de Zernio, no el de la plataforma (el payload trae los dos): es el
  // que se mantiene entre reentregas, que es lo que hay que colapsar.
  const zernioMessageId = evt.message?.id;
  if (!zernioMessageId) {
    console.warn(`[ig] evento ${evt.id ?? "?"} sin id de mensaje: descartado`);
    return;
  }

  await ingestInboundMessage({
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
    // Prefijado para que no colisione jamas con un id de WhatsApp en el
    // indice unico de mensajes.
    waMessageId: `ig_${zernioMessageId}`,
    type: "text",
    text,
    timestamp: zernioSentAtSeconds(evt.message?.sentAt),
    threadRef: evt.message?.conversationId ?? null,
  });
}

type IgAttachment = {
  type?: string; // "image" | "video" | "audio" | "file" | "story_mention" | "share" | ...
  payload?: { url?: string };
};

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
        attachments?: IgAttachment[];
      };
    }>;
  }>;
};

/**
 * Tipos de adjunto que Vocero soporta hoy (los que caben en `mediaAsset.kind`).
 * Los demás (story_mention, share, template) se ignoran con log.
 */
const IG_ATTACHMENT_KINDS = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
} as const;

type IgSupportedType = keyof typeof IG_ATTACHMENT_KINDS;

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
      const mid = m.message?.mid;
      if (!mid) continue;
      const text = typeof m.message?.text === "string" ? m.message.text : null;
      const attachment = firstSupportedAttachment(m.message?.attachments);

      // Sin texto y sin adjunto soportado: nada útil para el agente. Log
      // silencioso para no ruidar el webhook (Meta manda muchos eventos
      // colaterales — read/typing/postback — que caen aquí).
      if (text === null && !attachment) continue;

      // Echo: mensaje que el dueño envió a mano desde la app de Instagram
      // o desde Meta Business Suite. Se ingesta como saliente `origin='manual'`,
      // pausa la IA — mismo patrón que `smb_message_echoes` de WhatsApp.
      if (m.message?.is_echo) {
        const recipient = m.recipient?.id;
        if (!recipient) continue;
        try {
          const echoMedia = attachment
            ? await downloadIgAttachment(mid, attachment)
            : null;
          await ingestIgManualEcho({
            organizationId: creds.organizationId,
            recipientIgsid: recipient,
            mid,
            text,
            media: echoMedia,
            timestamp: m.timestamp,
          });
        } catch (err) {
          console.error(`[ig] error procesando echo ig_${mid}:`, err);
        }
        continue;
      }

      const igsid = m.sender?.id;
      if (!igsid) continue;

      // Meta no manda el nombre en el webhook, pero sí lo puedes leer
      // llamando /{igsid}?fields=name,username con el token de la cuenta.
      // Si falla (usuario privado, token sin scope, red), queda null y se
      // muestra el fallback "Contacto de Instagram".
      const profileName = await resolveIgProfileName(igsid, creds.token);

      // Adjunto: la URL de Meta expira en ~60 s, así que la bajamos aquí
      // mismo. Fallo de descarga → seguimos SÓLO con el texto (si hay);
      // sin texto y sin binario, el mensaje se pierde con log — mejor eso
      // que dejar un `mediaAsset` roto en la BD.
      let media: MediaInput | null = null;
      if (attachment) {
        media = await downloadIgAttachment(mid, attachment);
        if (!media && text === null) {
          console.warn(
            `[ig] mensaje ${mid} con adjunto no descargable y sin texto: descartado`
          );
          continue;
        }
      }

      await ingestInboundMessage({
        organizationId: creds.organizationId,
        identity: {
          identity: `${IG_PREFIX}${igsid}`,
          channel: "instagram",
          phone: null,
          waUserId: null,
          profileName,
        },
        waMessageId: `ig_${mid}`,
        type: media?.kind ?? "text",
        text,
        media,
        timestamp: String(
          m.timestamp ? Math.floor(m.timestamp / 1000) : Math.floor(Date.now() / 1000)
        ),
        threadRef: null,
      });
    }
  }
}

/**
 * Consulta el perfil público del que envió el DM. Meta expone `name` y
 * `username` en `GET /{igsid}?fields=name,username` con el token de la
 * cuenta, siempre y cuando la ventana de mensajería esté abierta (lo está
 * porque el usuario acaba de escribir). Prefiere `name`; si no está, usa
 * `@username`. Cualquier error deja `null` — el ingest sigue igual.
 */
async function resolveIgProfileName(
  igsid: string,
  token: string
): Promise<string | null> {
  const base =
    process.env.IG_GRAPH_BASE_URL ?? "https://graph.instagram.com";
  const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";
  const url = `${base}/${version}/${igsid}?fields=name,username`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      name?: string;
      username?: string;
    } | null;
    if (json?.name && json.name.trim()) return json.name.trim();
    if (json?.username && json.username.trim()) return `@${json.username.trim()}`;
    return null;
  } catch {
    return null;
  }
}

/**
 * Echo de Instagram (o Messenger): mensaje que el dueño envió A MANO
 * desde la app de Instagram del teléfono o desde Meta Business Suite. Se
 * registra como saliente `origin='manual'` y pausa la IA — mismo patrón
 * que `smb_message_echoes` de WhatsApp. Idempotente por `waMessageId`.
 */
async function ingestIgManualEcho(input: {
  organizationId: string;
  recipientIgsid: string;
  mid: string;
  text: string | null;
  media?: MediaInput | null;
  timestamp?: number;
}): Promise<void> {
  const db = getDb();
  const identity = `${IG_PREFIX}${input.recipientIgsid}`;

  const { contact } = await getOrCreateContactByIdentity(input.organizationId, {
    identity,
    channel: "instagram",
    phone: null,
    waUserId: null,
    profileName: null,
  });
  const conversation = await getOrCreateConversation(
    input.organizationId,
    contact.id,
    { channel: "instagram" }
  );

  const waTimestamp = new Date(
    input.timestamp ? input.timestamp : Date.now()
  );
  const waMessageId = `ig_${input.mid}`;
  const messageType = input.media?.kind ?? "text";

  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: conversation.id,
      waMessageId,
      direction: "out",
      type: messageType,
      text: input.text,
      status: "sent",
      origin: "manual",
      waTimestamp,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  if (!inserted[0]) return; // duplicado

  const asset = input.media
    ? await attachMediaAsset(input.organizationId, inserted[0].id, input.media)
    : null;

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: waTimestamp, updatedAt: new Date() })
    .where(eq(schema.conversation.id, conversation.id));

  const paused = await db
    .update(schema.conversation)
    .set({
      aiEnabled: false,
      handoffAt: new Date(),
      handoffReason: "manual_reply",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.conversation.id, conversation.id),
        sql`${schema.conversation.handoffAt} is null`
      )
    )
    .returning();
  if (paused[0]) {
    console.log(
      `[ig] respuesta manual del dueño en ${conversation.id} — IA pausada (manual_reply)`
    );
  }

  publish(input.organizationId, {
    type: "message.new",
    data: {
      conversationId: conversation.id,
      message: serializeMessage(inserted[0], asset),
    },
  });
}

/**
 * Primer adjunto con tipo soportado (image/video/audio/file). Los tipos
 * `story_mention`, `share`, `template`, etc. quedan fuera del alcance del
 * 014 — se registran arriba con log y se ignoran.
 */
function firstSupportedAttachment(
  attachments: IgAttachment[] | undefined
): { url: string; kind: MediaInput["kind"] } | null {
  if (!attachments?.length) return null;
  for (const att of attachments) {
    const raw = att.type as IgSupportedType | undefined;
    const url = att.payload?.url;
    if (!raw || !url) continue;
    const kind = IG_ATTACHMENT_KINDS[raw];
    if (!kind) continue;
    return { url, kind };
  }
  return null;
}

/**
 * Descarga el binario de un adjunto de Instagram (URL efímera de Meta) y lo
 * guarda en el volumen persistente. Devuelve un `MediaInput` listo para
 * `ingestInboundMessage` con `storagePath` preseeded y `fetchStatus="available"`
 * — con eso `attachMediaAsset` no llama `ensureAssetAvailable` (que sólo sabe
 * bajar por `waMediaId`, cosa que aquí no tenemos).
 *
 * Cualquier error deja `null` — quien llama decide si sigue con solo texto
 * o descarta el mensaje entero.
 */
async function downloadIgAttachment(
  mid: string,
  attachment: { url: string; kind: MediaInput["kind"] }
): Promise<MediaInput | null> {
  try {
    const res = await fetch(attachment.url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(
        `[ig] descarga adjunto de ${mid} devolvió ${res.status}`
      );
      return null;
    }
    const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      kind: attachment.kind,
      waMediaId: null,
      mimeType,
      fileName: null,
      caption: null,
      payload: { source: "instagram" },
      fetchStatus: "available",
      data: buf,
    };
  } catch (err) {
    console.warn(`[ig] descarga adjunto de ${mid} falló:`, err);
    return null;
  }
}
